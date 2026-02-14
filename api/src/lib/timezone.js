// api/src/lib/timezone.js
// Lightweight timezone helpers without external deps.
//
// We only need date-level (YYYY-MM-DD) operations aligned to an IANA timezone.

function isValidIanaTimeZone(timeZone) {
  if (!timeZone) return false;
  try {
    // Throws RangeError for invalid time zones.
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch (_err) {
    return false;
  }
}

function formatDateKeyFromParts(parts) {
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function formatDateKey(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  if (timeZone && isValidIanaTimeZone(timeZone)) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    return formatDateKeyFromParts(parts);
  }

  // Fallback: UTC date key.
  return d.toISOString().slice(0, 10);
}

function parseDateKeyUtc(dateKey) {
  const raw = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addDaysToDateKey(dateKey, deltaDays) {
  const base = parseDateKeyUtc(dateKey);
  if (!base) return null;
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + Number(deltaDays || 0));
  return next.toISOString().slice(0, 10);
}

function buildRollingDateRange({ days, timeZone, now } = {}) {
  const windowDays = Math.max(1, Number(days) || 1);
  const endKey = formatDateKey(now || new Date(), timeZone);
  if (!endKey) return null;
  const startKey = addDaysToDateKey(endKey, -(windowDays - 1));
  if (!startKey) return null;
  return {
    start: startKey,
    end: endKey,
    days: windowDays,
    timeZone: timeZone && isValidIanaTimeZone(timeZone) ? timeZone : 'UTC',
  };
}

function rangeTouchesToday(dateRange, timeZone, now) {
  const start = String(dateRange?.start || '');
  const end = String(dateRange?.end || '');
  if (!start || !end) return false;
  const todayKey = formatDateKey(now || new Date(), timeZone);
  if (!todayKey) return false;
  return start <= todayKey && end >= todayKey;
}

module.exports = {
  isValidIanaTimeZone,
  formatDateKey,
  addDaysToDateKey,
  buildRollingDateRange,
  rangeTouchesToday,
};
