const rawApiResponseService = require('./rawApiResponseService');

async function append(payload = {}, options = {}) {
  return rawApiResponseService.appendRawApiResponse(payload, options);
}

async function appendMany(items = [], options = {}) {
  return rawApiResponseService.appendRawApiResponses(items, options);
}

async function pruneExpired(options = {}) {
  return rawApiResponseService.purgeExpiredRawApiResponses(options);
}

module.exports = {
  append,
  appendMany,
  pruneExpired,
  appendRawApiResponse: rawApiResponseService.appendRawApiResponse,
  appendRawApiResponses: rawApiResponseService.appendRawApiResponses,
  purgeExpiredRawApiResponses: rawApiResponseService.purgeExpiredRawApiResponses,
  hashParams: rawApiResponseService.hashParams,
  stableStringify: rawApiResponseService.stableStringify,
  sanitizeForJson: rawApiResponseService.sanitizeForJson,
};
