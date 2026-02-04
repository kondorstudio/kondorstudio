const DEFAULT_TOP_N = 8;
const DEFAULT_SHOW_OTHERS = true;
const DEFAULT_OTHERS_LABEL = "Outros";

function clampTopN(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_TOP_N;
  return Math.max(3, Math.min(20, Math.round(numeric)));
}

function normalizeOthersLabel(value) {
  const label = String(value || "").trim();
  return label || DEFAULT_OTHERS_LABEL;
}

function normalizeSeries(rows, dimensionKey, metricKey) {
  const bucket = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const rawValue = Number(row?.[metricKey] ?? 0);
    if (!Number.isFinite(rawValue) || rawValue <= 0) return;

    const name = String(row?.[dimensionKey] ?? "Sem rotulo").trim() || "Sem rotulo";
    const previous = bucket.get(name) || 0;
    bucket.set(name, previous + rawValue);
  });

  return Array.from(bucket.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildPieSeries(rows, dimensionKey, metricKey, options = {}) {
  const topN = clampTopN(options?.topN);
  const showOthers = options?.showOthers !== false;
  const othersLabel = normalizeOthersLabel(options?.othersLabel);

  const sorted = normalizeSeries(rows, dimensionKey, metricKey);
  if (!sorted.length) {
    return { series: [], total: 0 };
  }

  let series = sorted;
  if (sorted.length > topN) {
    const topItems = sorted.slice(0, topN);
    if (showOthers) {
      const othersValue = sorted
        .slice(topN)
        .reduce((sum, item) => sum + Number(item.value || 0), 0);
      if (othersValue > 0) {
        series = [...topItems, { name: othersLabel, value: othersValue }];
      } else {
        series = topItems;
      }
    } else {
      series = topItems;
    }
  }

  const total = series.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (total <= 0) {
    return { series: [], total: 0 };
  }

  return { series, total };
}

export const PIE_DEFAULTS = Object.freeze({
  topN: DEFAULT_TOP_N,
  showOthers: DEFAULT_SHOW_OTHERS,
  othersLabel: DEFAULT_OTHERS_LABEL,
});
