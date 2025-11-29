// api/src/services/integrationsService.js
// Service para gerenciar integrações por tenant e enfileirar jobs
// Modelos esperados no schema: Integration, IntegrationJob, JobQueue (names podem variar; ajuste se necessário)

const { prisma, useTenant } = require('../prisma');

/**
 * Helpers utilitários
 */
function nowISO() {
  return new Date().toISOString();
}

function safeLog(...args) {
  if (process.env.NODE_ENV !== 'test') {
    console.log('[IntegrationsService]', ...args);
  }
}

/**
 * Cria uma integração para um tenant
 * data: { provider, credentials, name, active, config }
 */
async function createIntegration(tenantId, data = {}) {
  if (!tenantId) throw new Error('tenantId required for createIntegration');
  const t = useTenant(tenantId);

  const payload = {
    provider: data.provider,
    name: data.name || `${data.provider} integration`,
    credentials: data.credentials || null,
    config: data.config || null,
    active: typeof data.active === 'boolean' ? data.active : true,
    settings: data.settings || null,
    tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // create via tenant-scoped prisma
  const integration = await t.integration.create({ data: payload });
  safeLog('createIntegration', tenantId, integration.id);
  return integration;
}

/**
 * List integrations do tenant
 * opts: { activeOnly: boolean, provider?: string, limit, skip }
 */
async function listIntegrations(tenantId, opts = {}) {
  if (!tenantId) throw new Error('tenantId required for listIntegrations');
  const t = useTenant(tenantId);

  const where = { tenantId };
  if (opts.activeOnly) where.active = true;
  if (opts.provider) where.provider = opts.provider;

  const integrations = await t.integration.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: opts.limit || 50,
    skip: opts.skip || 0,
  });

  return integrations;
}

/**
 * Get integration by id (scoped)
 */
async function getIntegration(tenantId, integrationId) {
  if (!tenantId || !integrationId) throw new Error('tenantId and integrationId required for getIntegration');
  const t = useTenant(tenantId);
  return t.integration.findFirst({ where: { id: integrationId } });
}

/**
 * Update integration (scoped)
 * data pode conter credentials/config/active/name/settings
 */
async function updateIntegration(tenantId, integrationId, data = {}) {
  if (!tenantId || !integrationId) throw new Error('tenantId and integrationId required for updateIntegration');
  const t = useTenant(tenantId);

  const updateData = Object.assign({}, data, { updatedAt: new Date() });
  // remove id/tenantId caso venham no payload
  delete updateData.id;
  delete updateData.tenantId;

  const updated = await t.integration.update({
    where: { id: integrationId },
    data: updateData,
  });
  safeLog('updateIntegration', tenantId, integrationId);
  return updated;
}

/**
 * Delete integration (scoped)
 */
async function deleteIntegration(tenantId, integrationId) {
  if (!tenantId || !integrationId) throw new Error('tenantId and integrationId required for deleteIntegration');
  const t = useTenant(tenantId);
  const removed = await t.integration.delete({ where: { id: integrationId } });
  safeLog('deleteIntegration', tenantId, integrationId);
  return removed;
}

/**
 * testConnection(integration)
 * - integração simples para validar credenciais/config
 * - dependendo do provider, implementar ping na API (OAuth token check, API call, etc.)
 * Retorna { ok: boolean, message?: string, details?: any }
 */
async function testConnection(integration) {
  // integration: object retornado do banco (com provider e credentials)
  if (!integration) return { ok: false, message: 'integration required' };

  // stub: comportamento por provider básico
  try {
    if (integration.provider === 'google') {
      // TODO: implementar checagem real de token/refresh
      if (!integration.credentials || !integration.credentials.access_token) {
        return { ok: false, message: 'missing credentials.access_token' };
      }
      // assumimos ok por enquanto
      return { ok: true, message: 'credentials present' };
    }

    if (integration.provider === 'meta' || integration.provider === 'facebook') {
      // similar: checar access token / app secret
      if (!integration.credentials || !integration.credentials.access_token) {
        return { ok: false, message: 'missing credentials.access_token' };
      }
      return { ok: true, message: 'credentials present' };
    }

    // fallback genérico: se tiver credentials, retorna ok
    if (integration.credentials) {
      return { ok: true, message: 'credentials present' };
    }

    return { ok: false, message: 'no credentials' };
  } catch (err) {
    return { ok: false, message: 'error testing connection', details: err && err.message ? err.message : String(err) };
  }
}

/**
 * enqueueSync(tenantId, integrationId, payload)
 * Cria um IntegrationJob e coloca referência no JobQueue (global) para processamento por worker.
 * jobPayload: objeto livre com contexto (e.g. { since, metrics, clientId })
 */
async function enqueueSync(tenantId, integrationId, jobPayload = {}) {
  if (!tenantId || !integrationId) throw new Error('tenantId and integrationId required for enqueueSync');

  // cria IntegrationJob no escopo do tenant (útil para auditoria)
  const t = useTenant(tenantId);
  const job = await t.integrationJob.create({
    data: {
      integrationId,
      tenantId,
      status: 'PENDING',
      payload: jobPayload,
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // cria uma entrada na fila global (jobQueue) para que workers consumam
  // JobQueue é considerado global; usamos prisma direto (no root prisma) para garantir visibilidade
  const queueEntry = await prisma.jobQueue.create({
    data: {
      jobType: 'integration_sync',
      referenceId: job.id,
      tenantId,
      payload: jobPayload,
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  safeLog('enqueueSync', tenantId, integrationId, job.id, queueEntry.id);
  return { job, queueEntry };
}

/**
 * syncMetrics(tenantId, integrationId, opts)
 * - Enfileira um job de sincronização de métricas da integração
 * - opts: { since, clientId, manual: boolean }
 */
async function syncMetrics(tenantId, integrationId, opts = {}) {
  if (!tenantId || !integrationId) throw new Error('tenantId and integrationId required for syncMetrics');
  // valida integração ativa
  const integration = await getIntegration(tenantId, integrationId);
  if (!integration) throw new Error('integration not found');
  if (!integration.active) throw new Error('integration not active');

  // test basic connection before queueing (non-blocking)
  const test = await testConnection(integration);
  if (!test.ok) {
    // rejeitamos a sincronização por credenciais inválidas
    throw new Error(`integration connection failed: ${test.message}`);
  }

  const payload = {
    since: opts.since || null,
    clientId: opts.clientId || null,
    manual: !!opts.manual,
    requestedAt: new Date().toISOString(),
  };

  // enfileira
  const result = await enqueueSync(tenantId, integrationId, payload);
  return result;
}

/**
 * processIntegrationJob(jobId)
 * Implementação utilitária para o worker processar um IntegrationJob.
 * - Carrega job e integration
 * - Marca status RUNNING / SUCCEEDED / FAILED
 * - Salva métricas em tabela metric (ex: prisma.metric.create)
 *
 * Observação: essa função é chamada pelo worker; aqui mantemos ela idempotente e com tratamento de erros.
 */
async function processIntegrationJob(jobId) {
  if (!jobId) throw new Error('jobId required for processIntegrationJob');

  // Carrega job com prisma (global), inclui tenantId e integrationId
  const job = await prisma.integrationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('integration job not found');

  const tenantId = job.tenantId;
  if (!tenantId) throw new Error('job missing tenantId');

  const t = useTenant(tenantId);

  // lock / mark running
  await prisma.integrationJob.update({ where: { id: jobId }, data: { status: 'RUNNING', updatedAt: new Date(), attempts: job.attempts + 1 } });

  const integration = await t.integration.findFirst({ where: { id: job.integrationId } });
  if (!integration) {
    await prisma.integrationJob.update({ where: { id: jobId }, data: { status: 'FAILED', updatedAt: new Date() } });
    throw new Error('integration not found for job');
  }

  try {
    // aqui o worker deve chamar a API do provider para coletar métricas
    // Exemplo stub: criamos uma métrica falsa para demonstrar
    const fakeMetric = {
      clientId: job.payload && job.payload.clientId ? job.payload.clientId : null,
      type: 'integration.sync',
      value: 1,
      timestamp: new Date(),
      meta: { note: 'stub metric from processIntegrationJob' },
      source: integration.provider,
    };

    // salvar métrica via tenant-scoped prisma
    await t.metric.create({
      data: {
        tenantId,
        clientId: fakeMetric.clientId,
        type: fakeMetric.type,
        value: fakeMetric.value,
        timestamp: fakeMetric.timestamp,
        meta: fakeMetric.meta,
        source: fakeMetric.source,
      },
    });

    // marcar job como succeeded
    await prisma.integrationJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', updatedAt: new Date() } });

    // opcional: atualizar queueEntry se existir
    await prisma.jobQueue.updateMany({ where: { referenceId: jobId }, data: { status: 'done', updatedAt: new Date() } });

    safeLog('processIntegrationJob succeeded', jobId);
    return { ok: true };
  } catch (err) {
    // marca falha e requeue logic (simplificada)
    await prisma.integrationJob.update({ where: { id: jobId }, data: { status: 'FAILED', updatedAt: new Date() } });
    await prisma.jobQueue.updateMany({ where: { referenceId: jobId }, data: { status: 'failed', updatedAt: new Date() } });

    safeLog('processIntegrationJob FAILED', jobId, err && err.message ? err.message : err);
    throw err;
  }
}

/**
 * Export
 */
module.exports = {
  createIntegration,
  listIntegrations,
  getIntegration,
  updateIntegration,
  deleteIntegration,
  testConnection,
  syncMetrics,
  enqueueSync,
  processIntegrationJob,
};
