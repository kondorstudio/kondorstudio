export function toDateKey(date) {
  if (!(date instanceof Date)) return "";
  return date.toISOString().slice(0, 10);
}

export function resolveDateRange(range) {
  const preset = range?.preset || "last_7_days";
  const today = new Date();
  const end = toDateKey(today);

  if (preset === "last_30_days") {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);
    return { start: toDateKey(startDate), end };
  }

  if (preset === "custom") {
    const start = range?.start || "";
    const customEnd = range?.end || "";
    if (start && customEnd) return { start, end: customEnd };
  }

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 6);
  return { start: toDateKey(startDate), end };
}

export function stableStringify(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `"${key}":${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function buildWidgetQueryKey({ dashboardId, widget, globalFilters }) {
  const filtersKey = stableStringify({
    globalFilters,
    query: widget?.query || {},
  });
  return ["reportsV2-widget", dashboardId, widget?.id || "unknown", filtersKey];
}

export function mergeWidgetFilters(widgetFilters = [], globalFilters = {}) {
  const merged = Array.isArray(widgetFilters) ? [...widgetFilters] : [];
  const platforms = Array.isArray(globalFilters?.platforms)
    ? globalFilters.platforms
    : [];

  if (platforms.length) {
    merged.push({ field: "platform", op: "in", value: platforms });
  }

  return merged;
}
