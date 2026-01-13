const reportSchedulesService = require("../modules/reporting/reportSchedules.service");

async function processJob(data = {}) {
  const tenantId = data.tenantId;
  const scheduleId = data.scheduleId;
  if (!tenantId || !scheduleId) {
    const err = new Error("tenantId/scheduleId obrigatorios");
    err.status = 400;
    throw err;
  }
  return reportSchedulesService.runSchedule(tenantId, scheduleId);
}

module.exports = {
  processJob,
};
