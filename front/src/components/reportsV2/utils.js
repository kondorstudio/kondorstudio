import { useEffect, useState } from "react";

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const DEFAULT_REPORT_THEME = Object.freeze({
  mode: "light",
  brandColor: "#F59E0B",
  accentColor: "#22C55E",
  bg: "#FFFFFF",
  text: "#0F172A",
  mutedText: "#64748B",
  cardBg: "#FFFFFF",
  border: "#E2E8F0",
  radius: 16,
});

export const DEFAULT_FILTER_CONTROLS = Object.freeze({
  showDateRange: true,
  showPlatforms: true,
  showAccounts: true,
});

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) return fallback;
  return trimmed.length === 4
    ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase()
    : trimmed.toUpperCase();
}

export function normalizeThemeFront(theme) {
  return {
    mode: "light",
    brandColor: normalizeHexColor(theme?.brandColor, DEFAULT_REPORT_THEME.brandColor),
    accentColor: normalizeHexColor(theme?.accentColor, DEFAULT_REPORT_THEME.accentColor),
    bg: normalizeHexColor(theme?.bg, DEFAULT_REPORT_THEME.bg),
    text: normalizeHexColor(theme?.text, DEFAULT_REPORT_THEME.text),
    mutedText: normalizeHexColor(theme?.mutedText, DEFAULT_REPORT_THEME.mutedText),
    cardBg: normalizeHexColor(theme?.cardBg, DEFAULT_REPORT_THEME.cardBg),
    border: normalizeHexColor(theme?.border, DEFAULT_REPORT_THEME.border),
    radius: Math.max(
      0,
      Math.min(32, Number.isFinite(Number(theme?.radius)) ? Number(theme.radius) : DEFAULT_REPORT_THEME.radius)
    ),
  };
}

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

export function generateUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function normalizeWidgetRect(layout, gridCols = 12) {
  const safeCols = Math.max(1, Number(gridCols) || 12);
  const w = Math.max(1, Number(layout?.w || 1));
  const h = Math.max(1, Number(layout?.h || 1));
  const maxX = Math.max(0, safeCols - w);
  const x = Math.max(0, Math.min(Number(layout?.x || 0), maxX));
  const y = Math.max(0, Number(layout?.y || 0));
  return { x, y, w, h };
}

function isRectCollision(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function isLayoutColliding(candidateRect, widgets = [], ignoreWidgetId) {
  return widgets.some((widget) => {
    if (!widget || widget.id === ignoreWidgetId) return false;
    const rect = normalizeWidgetRect(widget.layout);
    return isRectCollision(candidateRect, rect);
  });
}

function pickNonCollidingPosition(baseRect, widgets = [], ignoreWidgetId, gridCols = 12) {
  const offsets = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
  ];
  const safeCols = Math.max(1, Number(gridCols) || 12);

  for (const offset of offsets) {
    const candidateRect = normalizeWidgetRect(
      {
        ...baseRect,
        x: Number(baseRect.x || 0) + offset.x,
        y: Number(baseRect.y || 0) + offset.y,
      },
      safeCols
    );
    if (!isLayoutColliding(candidateRect, widgets, ignoreWidgetId)) {
      return { x: candidateRect.x, y: candidateRect.y };
    }
  }

  const fallback = normalizeWidgetRect(
    {
      ...baseRect,
      x: Number(baseRect.x || 0),
      y: Number(baseRect.y || 0) + 2,
    },
    safeCols
  );
  return { x: fallback.x, y: fallback.y };
}

export function duplicateWidget(widget, existingWidgets = [], gridCols = 12) {
  if (!widget || typeof widget !== "object") return null;

  const existingIds = new Set(
    (Array.isArray(existingWidgets) ? existingWidgets : [])
      .map((item) => item?.id)
      .filter(Boolean)
  );

  let nextId = generateUuid();
  while (existingIds.has(nextId)) {
    nextId = generateUuid();
  }

  const cloned = JSON.parse(JSON.stringify(widget));
  const baseRect = normalizeWidgetRect(cloned.layout, gridCols);
  const nextPosition = pickNonCollidingPosition(
    baseRect,
    existingWidgets,
    widget.id,
    gridCols
  );

  cloned.id = nextId;
  cloned.title = `${widget.title || "Widget"} (copia)`;
  cloned.layout = {
    ...cloned.layout,
    x: nextPosition.x,
    y: nextPosition.y,
    w: baseRect.w,
    h: baseRect.h,
  };

  return cloned;
}

export function normalizeLayoutFront(layout) {
  if (!layout || typeof layout !== "object") return null;
  const theme = normalizeThemeFront(layout.theme || {});
  const rawGlobalFilters = layout.globalFilters || {};
  const globalFilters = {
    ...rawGlobalFilters,
    controls: {
      ...DEFAULT_FILTER_CONTROLS,
      ...(rawGlobalFilters?.controls || {}),
    },
  };

  const normalizePage = (page, index) => ({
    id: page?.id || generateUuid(),
    name:
      page?.name && String(page.name).trim()
        ? String(page.name).trim().slice(0, 60)
        : `Pagina ${index + 1}`,
    widgets: Array.isArray(page?.widgets) ? page.widgets : [],
  });

  if (Array.isArray(layout.pages) && layout.pages.length) {
    return {
      theme,
      globalFilters,
      pages: layout.pages.map(normalizePage),
    };
  }

  const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
  return {
    theme,
    globalFilters,
    pages: [
      {
        id: generateUuid(),
        name: "Pagina 1",
        widgets,
      },
    ],
  };
}

export function getActivePage(layout, activePageId) {
  const pages = Array.isArray(layout?.pages) ? layout.pages : [];
  if (!pages.length) return null;
  return pages.find((page) => page.id === activePageId) || pages[0];
}

export function buildWidgetQueryKey({
  dashboardId,
  widget,
  globalFilters,
  pagination,
  pageId,
}) {
  const filtersKey = stableStringify({
    globalFilters,
    query: widget?.query || {},
    pagination: pagination || null,
    pageId: pageId || null,
  });
  return ["reportsV2-widget", dashboardId, widget?.id || "unknown", filtersKey];
}

export function mergeWidgetFilters(widgetFilters = [], globalFilters = {}) {
  const merged = Array.isArray(widgetFilters) ? [...widgetFilters] : [];
  const platforms = Array.isArray(globalFilters?.platforms)
    ? globalFilters.platforms
    : [];
  const accounts = Array.isArray(globalFilters?.accounts)
    ? globalFilters.accounts
    : [];

  if (platforms.length) {
    merged.push({ field: "platform", op: "in", value: platforms });
  }

  const accountIds = Array.from(
    new Set(
      accounts
        .map((account) => {
          if (typeof account === "string") return account.trim();
          if (!account || typeof account !== "object") return "";
          return String(
            account.external_account_id ||
              account.externalAccountId ||
              account.account_id ||
              account.id ||
              account.value ||
              ""
          ).trim();
        })
        .filter(Boolean)
    )
  );
  if (accountIds.length) {
    merged.push({ field: "account_id", op: "in", value: accountIds });
  }

  return merged;
}

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return debounced;
}
