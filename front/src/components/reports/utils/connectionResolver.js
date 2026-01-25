export function filterConnected(connections) {
  if (!Array.isArray(connections)) return [];
  return connections.filter((item) => item && item.status === "CONNECTED");
}

export function pickConnectionId({ connections, source, preferredId }) {
  const connected = filterConnected(connections);
  const scoped = source
    ? connected.filter((item) => item && item.source === source)
    : connected;
  if (preferredId && scoped.some((item) => item?.id === preferredId)) {
    return preferredId;
  }
  const match = scoped.find((item) => item?.id);
  return match?.id || "";
}

export function hasConnectedForSource({ connections, source }) {
  if (!source) return false;
  const connected = filterConnected(connections);
  return connected.some((item) => item?.source === source);
}
