const metaAds = require('./metaAds.adapter');
const metaSocial = require('./metaSocial.adapter');
const googleAds = require('./googleAds.adapter');
const ga4 = require('./ga4.adapter');
const gbp = require('./gbp.adapter');
const tiktokAds = require('./tiktokAds.adapter');
const linkedinAds = require('./linkedinAds.adapter');

const ADAPTERS = {
  META_ADS: metaAds,
  META_SOCIAL: metaSocial,
  GOOGLE_ADS: googleAds,
  GA4: ga4,
  GBP: gbp,
  TIKTOK_ADS: tiktokAds,
  LINKEDIN_ADS: linkedinAds,
};

function getAdapter(source) {
  if (!source) return null;
  return ADAPTERS[source] || null;
}

function getIntegrationKind(integration) {
  if (!integration || !integration.settings) return null;
  if (typeof integration.settings !== 'object' || Array.isArray(integration.settings)) {
    return null;
  }
  const kind = integration.settings.kind;
  if (!kind) return null;
  return String(kind).toLowerCase();
}

module.exports = {
  getAdapter,
  getIntegrationKind,
};
