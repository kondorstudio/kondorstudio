// api/src/services/whatsappProvider.js
// Provider de WhatsApp para o KONDOR STUDIO.
//
// Objetivo:
// - Expor uma função única: send(tenantId, to, message, opts?)
// - Ser chamado pelo automationWhatsAppJob
// - Encapsular integração HTTP com o gateway configurado via ENV
//
// Este provider foi modelado para funcionar em produção de forma previsível,
// sem acoplar o restante do código a um provedor específico.
//
// Variáveis de ambiente esperadas:
// - WHATSAPP_PROVIDER        -> 'generic' (default) | 'meta' | 'twilio' | etc. (apenas para meta-informação por enquanto)
// - WHATSAPP_API_URL         -> URL do endpoint de mensagens
// - WHATSAPP_API_KEY         -> Token/chave de autenticação (Bearer)
// - WHATSAPP_TOKEN           -> Alternativa a WHATSAPP_API_KEY (fallback; usado se API_KEY não existir)
// - WHATSAPP_FROM_NUMBER     -> Remetente padrão (quando aplicável)
// - WHATSAPP_TIMEOUT_MS      -> Timeout em ms (default: 8000)
//
// Protocolo HTTP genérico:
//
// POST WHATSAPP_API_URL
// Headers:
//   Authorization: Bearer <WHATSAPP_API_KEY ou WHATSAPP_TOKEN>
//   Content-Type: application/json
//
// Body JSON:
//   {
//     to: string,          // número E.164 ou identificador do contato
//     message: string,     // texto final já renderizado
//     from: string|null,   // remetente (quando aplicável)
//     tenantId: string,
//     meta: { ... }        // informações auxiliares (tags, provider, vars, etc.)
//   }
//
// OBS: Quando for conectar em um gateway oficial (ex.: Meta Cloud API),
// basta adaptar o WHATSAPP_API_URL / formato esperado do body no próprio
// gateway (via proxy) ou evoluir este módulo mantendo SEMPRE a mesma
// assinatura da função send, para não quebrar o restante do sistema.

const DEFAULT_TIMEOUT_MS = Number(process.env.WHATSAPP_TIMEOUT_MS || 8000);
const PROVIDER = (process.env.WHATSAPP_PROVIDER || 'generic').toLowerCase();
const API_URL = process.env.WHATSAPP_API_URL || '';
// Suporta tanto WHATSAPP_API_KEY quanto WHATSAPP_TOKEN (fallback)
const API_KEY = process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_TOKEN || '';
const FROM_NUMBER = process.env.WHATSAPP_FROM_NUMBER || null;

/**
 * safeLog
 * - Log protegido para não poluir testes.
 */
function safeLog(...args) {
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log('[whatsappProvider]', ...args);
  }
}

/**
 * httpPostJson
 * - Wrapper simples usando fetch + timeout para POST JSON.
 * - Evita depender de axios aqui apenas para uma chamada HTTP.
 */
async function httpPostJson(url, body, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error(
      'Global fetch() não disponível no runtime Node. Atualize a versão do Node ou adicione um HTTP client.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = text;
    }

    return {
      status: res.status,
      ok: res.ok,
      data,
    };
  } catch (err) {
    // Normaliza erro de timeout/abort
    if (err && err.name === 'AbortError') {
      const timeoutError = new Error('Timeout ao chamar gateway WhatsApp');
      timeoutError.code = 'ETIMEDOUT';
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * buildPayload
 * - Monta o body enviado ao gateway, em formato genérico.
 * - Caso você queira um formato custom para um provedor específico,
 *   esse é o único lugar que precisa ser ajustado.
 */
function buildPayload(tenantId, to, message, opts = {}) {
  const meta = {
    provider: opts.provider || PROVIDER,
    ...opts.meta,
  };

  return {
    to,
    message,
    from: opts.from || FROM_NUMBER,
    tenantId,
    meta,
  };
}

/**
 * send(tenantId, to, message, opts?)
 *
 * @param {string} tenantId - Tenant atual
 * @param {string} to       - Número/identificador do contato (ex.: +5511999999999)
 * @param {string} message  - Texto final já renderizado pelo job
 * @param {object} opts     - Opções adicionais (template, vars, tags, etc.)
 *
 * Retorno:
 * - { ok: true, data } em sucesso
 * - { ok: false, error, skipped?, status?, data? } em falha
 */
async function send(tenantId, to, message, opts = {}) {
  // Se envs críticas estiverem ausentes, não tentamos enviar nem causar retries infinitos.
  if (!API_URL || !API_KEY) {
    safeLog('WHATSAPP_API_URL/WHATSAPP_API_KEY/WHATSAPP_TOKEN não configurados — ignorando envio', {
      tenantId,
      to,
    });
    return {
      ok: false,
      skipped: true,
      error:
        'WhatsApp provider não configurado (WHATSAPP_API_URL e WHATSAPP_API_KEY/WHATSAPP_TOKEN ausentes)',
    };
  }

  if (!to || !message) {
    return {
      ok: false,
      error: 'Parâmetros inválidos: "to" e "message" são obrigatórios',
    };
  }

  const payload = buildPayload(tenantId, to, message, opts);

  try {
    const response = await httpPostJson(API_URL, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });

    const { status, ok, data } = response;

    if (!ok) {
      const logicalError =
        (data && (data.error || data.message)) ||
        `Gateway WhatsApp retornou status HTTP ${status}`;

      safeLog('Gateway WhatsApp retornou erro', {
        tenantId,
        to,
        status,
        error: logicalError,
      });

      return {
        ok: false,
        status,
        error: logicalError,
        data,
      };
    }

    safeLog('Mensagem WhatsApp enviada com sucesso', {
      tenantId,
      to,
      provider: PROVIDER,
      status,
    });

    return {
      ok: true,
      status,
      data,
    };
  } catch (err) {
    const status = err && err.status;
    const msg =
      err && err.code === 'ETIMEDOUT'
        ? 'Timeout ao chamar gateway WhatsApp'
        : (err && err.message) || String(err);

    safeLog('Erro ao enviar mensagem WhatsApp', {
      tenantId,
      to,
      provider: PROVIDER,
      status,
      error: msg,
    });

    return {
      ok: false,
      status,
      error: msg,
    };
  }
}

module.exports = {
  send,
};
