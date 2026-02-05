const BRAND_PRIMARY = "#B050F0";
const BRAND_ACCENT = "#B050F0";
const FORCE_BRAND_THEME = true;

const DEFAULT_PRIMARY = BRAND_PRIMARY;
const DEFAULT_ACCENT = BRAND_ACCENT;

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clampChannel(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(255, Math.round(num)));
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX_RE.test(trimmed)) return fallback;
  if (trimmed.length === 4) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function hexToRgb(hex) {
  const safe = normalizeHexColor(hex, "#000000").slice(1);
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex({ r, g, b }) {
  const toHex = (channel) => clampChannel(channel).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function mixRgb(base, target, amount) {
  const ratio = Math.max(0, Math.min(1, Number(amount) || 0));
  return {
    r: clampChannel(base.r + (target.r - base.r) * ratio),
    g: clampChannel(base.g + (target.g - base.g) * ratio),
    b: clampChannel(base.b + (target.b - base.b) * ratio),
  };
}

function rgbaString(rgb, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${clampChannel(rgb.r)}, ${clampChannel(rgb.g)}, ${clampChannel(
    rgb.b
  )}, ${a})`;
}

export function deriveThemeColors(tenant = {}) {
  const primary = FORCE_BRAND_THEME
    ? BRAND_PRIMARY
    : normalizeHexColor(
        tenant.primary_color || tenant.primaryColor || tenant.primary,
        DEFAULT_PRIMARY
      );
  const accent = FORCE_BRAND_THEME
    ? BRAND_ACCENT
    : normalizeHexColor(
        tenant.accent_color || tenant.accentColor || tenant.accent,
        DEFAULT_ACCENT
      );

  const primaryRgb = hexToRgb(primary);
  const accentRgb = hexToRgb(accent);
  const primaryDark = rgbToHex(mixRgb(primaryRgb, { r: 0, g: 0, b: 0 }, 0.16));
  const primaryLight = rgbaString(primaryRgb, 0.12);

  return {
    primary,
    accent,
    primaryDark,
    primaryLight,
    primaryRgb,
    accentRgb,
  };
}

export function applyTenantTheme(tenant) {
  if (typeof document === "undefined") return null;
  const theme = deriveThemeColors(tenant || {});
  const root = document.documentElement;

  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-dark", theme.primaryDark);
  root.style.setProperty("--primary-light", theme.primaryLight);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty(
    "--primary-rgb",
    `${theme.primaryRgb.r}, ${theme.primaryRgb.g}, ${theme.primaryRgb.b}`
  );
  root.style.setProperty(
    "--accent-rgb",
    `${theme.accentRgb.r}, ${theme.accentRgb.g}, ${theme.accentRgb.b}`
  );
  root.style.setProperty("--chart-1", theme.primary);
  root.style.setProperty("--chart-3", theme.accent);

  return theme;
}

export function resolveTenantBranding(tenant = {}) {
  if (FORCE_BRAND_THEME) {
    return {
      name: tenant.agency_name || tenant.name || "Kondor",
      logoUrl: tenant.logo_url || tenant.logoUrl || null,
      primaryColor: BRAND_PRIMARY,
      accentColor: BRAND_ACCENT,
    };
  }
  return {
    name: tenant.agency_name || tenant.name || "Kondor",
    logoUrl: tenant.logo_url || tenant.logoUrl || null,
    primaryColor: tenant.primary_color || tenant.primaryColor || DEFAULT_PRIMARY,
    accentColor: tenant.accent_color || tenant.accentColor || DEFAULT_ACCENT,
  };
}

export const DEFAULT_THEME = {
  primary: DEFAULT_PRIMARY,
  accent: DEFAULT_ACCENT,
};
