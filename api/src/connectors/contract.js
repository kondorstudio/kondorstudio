const REQUIRED_CONNECTOR_METHODS = Object.freeze([
  'preview',
  'enqueueBackfill',
  'incremental',
  'normalize',
  'upsertFacts',
]);

function assertConnectorContract(connector, name = 'connector') {
  if (!connector || typeof connector !== 'object') {
    throw new TypeError(`Connector "${name}" must be an object`);
  }

  const missing = REQUIRED_CONNECTOR_METHODS.filter(
    (method) => typeof connector[method] !== 'function',
  );

  if (missing.length) {
    throw new TypeError(
      `Connector "${name}" is missing required methods: ${missing.join(', ')}`,
    );
  }
}

function ensureConnectorContract(connector, name = 'connector') {
  assertConnectorContract(connector, name);
  return connector;
}

module.exports = {
  REQUIRED_CONNECTOR_METHODS,
  assertConnectorContract,
  ensureConnectorContract,
};
