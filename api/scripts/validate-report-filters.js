#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { prisma } = require('../src/prisma');
const reportingData = require('../src/modules/reporting/reportingData.service');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function readJsonFile(filePath) {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const payloadPath = getArg('--payload');
  const connectionId = getArg('--connection');

  if (!payloadPath) {
    console.log('Uso: node api/scripts/validate-report-filters.js --payload ./payload.json [--connection <id>]');
    process.exit(1);
  }

  const payload = readJsonFile(payloadPath);
  const connection = connectionId || payload.connectionId;

  if (!connection) {
    console.error('Informe connectionId via --connection ou no payload.json');
    process.exit(1);
  }

  const connectionRecord = await prisma.dataSourceConnection.findUnique({
    where: { id: String(connection) },
  });

  if (!connectionRecord) {
    console.error('Connection nao encontrada:', connection);
    process.exit(1);
  }

  const tenantId = connectionRecord.tenantId;
  const finalPayload = {
    ...payload,
    source: payload.source || connectionRecord.source,
    connectionId: String(connection),
  };

  try {
    const result = await reportingData.queryMetrics(tenantId, finalPayload, null);
    console.log(JSON.stringify({
      cached: result.cached,
      cacheKey: result.cacheKey,
      data: result.data,
    }, null, 2));
  } catch (err) {
    console.error('Erro ao validar filtros:', err?.message || err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
