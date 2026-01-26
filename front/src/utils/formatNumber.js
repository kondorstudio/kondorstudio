export function formatNumber(value, { currency, compact = true } = {}) {
  if (value === null || value === undefined || value === "") return "-";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return String(value);

  const absValue = Math.abs(number);
  const shouldCompact = compact && absValue >= 1000;
  const options = {};
  if (shouldCompact) {
    options.notation = "compact";
    options.maximumFractionDigits = 2;
  } else if (absValue < 1) {
    options.maximumFractionDigits = 2;
  } else {
    options.maximumFractionDigits = 0;
  }

  if (currency) {
    options.style = "currency";
    options.currency = currency;
    if (!shouldCompact) {
      delete options.maximumFractionDigits;
    }
  } else if (!shouldCompact) {
    options.notation = "standard";
  }

  try {
    return new Intl.NumberFormat("pt-BR", options).format(number);
  } catch (err) {
    return number.toLocaleString("pt-BR");
  }
}
