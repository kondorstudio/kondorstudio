// front/src/lib/media.js
import { base44 } from "@/apiClient/base44Client";

/**
 * Descobre o protocolo preferido (http/https) com base na página ou na VITE_API_URL.
 */
function getPreferredProtocol() {
  if (typeof window !== "undefined" && window.location?.protocol) {
    return window.location.protocol;
  }

  const envBase =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_URL) ||
    base44.API_BASE_URL ||
    "";

  if (envBase) {
    try {
      const parsed = new URL(envBase);
      if (parsed.protocol) {
        return parsed.protocol;
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Garante que uma URL http/https use o mesmo protocolo da página (evita mixed content).
 */
function enforceProtocol(url) {
  if (!/^https?:\/\//i.test(url)) return url;
  const preferred = getPreferredProtocol();
  if (!preferred) return url;

  try {
    const parsed = new URL(url);

    // se for localhost, não força https (pra não quebrar em dev)
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname.startsWith("127.")
    ) {
      return url;
    }

    if (parsed.protocol !== preferred) {
      parsed.protocol = preferred;
      return parsed.toString();
    }
  } catch (_) {}

  return url;
}

/**
 * Resolve a mídia do post para uma URL final carregável no <img>.
 *
 * Aceita:
 * - URL completa: "https://.../uploads/public/tenant%2F..."
 * - Path relativo: "/uploads/public/tenant%2F..."
 * - Apenas a key do storage: "tenant/posts/arquivo.png"
 */
export function resolveMediaUrl(raw) {
  if (!raw) return "";

  // blob local (preview antes de salvar)
  if (raw.startsWith("blob:")) {
    return raw;
  }

  // já é URL completa (http/https): só ajusta protocolo se precisar
  if (/^https?:\/\//i.test(raw)) {
    return enforceProtocol(raw);
  }

  // base da API (Render ou local)
  const base =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_API_URL) ||
    base44.API_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "") ||
    "";
  const normalizedBase = base.replace(/\/+$/, "");
  const publicBase =
    normalizedBase && /\/api$/i.test(normalizedBase)
      ? normalizedBase.replace(/\/api$/i, "")
      : normalizedBase;
  const mediaBase = publicBase || normalizedBase;

  // Se já veio um path que contém "/uploads", só completa com a base.
  // Ex.: "/uploads/public/tenant%2F..." ou "uploads/public/tenant%2F..."
  if (raw.includes("/uploads/")) {
    const suffix = raw.startsWith("/") ? raw : `/${raw}`;
    const url = mediaBase ? `${mediaBase}${suffix}` : suffix;
    return enforceProtocol(url);
  }

  // Caso contrário, assumimos que é só a "key" do arquivo (ex.: "tenant/posts/arquivo.png")
  // e montamos a rota pública correta.
  const encodedKey = encodeURIComponent(raw);
  const suffix = `/uploads/public/${encodedKey}`;
  const url = mediaBase ? `${mediaBase}${suffix}` : suffix;

  return enforceProtocol(url);
}

/**
 * Detecta se uma mídia deve ser tratada como vídeo.
 * Útil para renderizar <video> em vez de <img>.
 */
export function isVideoMedia({ url, mediaType, mimeType } = {}) {
  const type = (mediaType || "").toString().toLowerCase().trim();
  if (type.includes("video")) return true;

  const mime = (mimeType || "").toString().toLowerCase().trim();
  if (mime.startsWith("video/")) return true;

  const normalizedUrl = (url || "").toString();
  if (!normalizedUrl) return false;
  return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(normalizedUrl);
}
