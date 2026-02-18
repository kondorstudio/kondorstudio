const { ensureConnectorContract } = require('./contract');
const ga4Connector = require('./providers/ga4Connector');
const metaConnector = require('./providers/metaConnector');

const CONNECTORS = {
  GA4: ga4Connector,
  META: metaConnector,
};

function getConnector(provider) {
  const key = String(provider || '').trim().toUpperCase();
  if (!key) return null;
  const connector = CONNECTORS[key] || null;
  if (!connector) return null;
  return ensureConnectorContract(connector, key);
}

module.exports = {
  CONNECTORS,
  getConnector,
};
