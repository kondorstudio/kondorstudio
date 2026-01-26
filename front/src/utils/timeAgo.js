export function formatTimeAgo(value) {
  if (!value) return "";
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) return "";
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return "Atualizado agora";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `Atualizado ha ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Atualizado ha ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Atualizado ha ${diffDays} d`;
}
