// src/apiClient/base44Client.js

// Convenção:
// - VITE_API_URL aponta para a ORIGEM (ex.: https://kondorstudio.app), sem "/api"
// - As chamadas do cliente sempre trafegam em "/api/*"
const API_PREFIX = "/api";

function detectWindowOrigin() {
  if (typeof window === "undefined") return null;
  const { origin } = window.location || {};
  if (origin && origin.startsWith("http")) {
    return origin;
  }
  return null;
}

function normalizeApiBaseUrl(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      parsed.search = "";
      let pathname =
        parsed.pathname && parsed.pathname !== "/"
          ? parsed.pathname.replace(/\/+$/, "")
          : "";
      if (pathname === API_PREFIX) {
        pathname = "";
      } else if (/\/api$/i.test(pathname)) {
        pathname = pathname.replace(/\/api$/i, "");
      }
      parsed.pathname = pathname || "/";
      return parsed.toString().replace(/\/$/, "");
    } catch (_) {
      const cleaned = raw.replace(/\/+$/, "");
      if (/\/api$/i.test(cleaned)) {
        return cleaned.replace(/\/api$/i, "");
      }
      return cleaned;
    }
  }

  const cleaned = raw.replace(/\/+$/, "");
  if (!cleaned || cleaned === "/" || cleaned === API_PREFIX) return "";
  if (cleaned.startsWith("/")) return cleaned.replace(/\/api$/i, "");
  return `/${cleaned}`;
}

function detectSameOriginApiBaseUrl() {
  const origin = detectWindowOrigin();
  if (!origin) return null;

  try {
    const parsed = new URL(origin);
    const host = (parsed.hostname || "").toLowerCase();

    // Fallback explícito para produção do projeto:
    // se o painel estiver em kondorstudio.app, a API fica em api.kondorstudio.app.
    if (host === "kondorstudio.app" || host === "www.kondorstudio.app") {
      const apiOrigin = `${parsed.protocol}//api.kondorstudio.app`;
      return normalizeApiBaseUrl(apiOrigin);
    }
  } catch (_) {}

  return normalizeApiBaseUrl(origin);
}

function preferPageProtocol(url) {
  if (!url) return url;
  if (typeof window === "undefined") return url;
  const pageProtocol = window.location?.protocol;
  if (!pageProtocol || pageProtocol === "http:") return url;
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname.startsWith("127.")
    ) {
      return url;
    }
    if (parsed.protocol !== pageProtocol) {
      parsed.protocol = pageProtocol;
      return parsed.toString();
    }
  } catch (err) {
    if (/^http:\/\//i.test(url)) {
      return url.replace(/^http:/i, pageProtocol);
    }
  }
  return url;
}

const configuredApiBaseUrl =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_URL || import.meta.env.VITE_APP_API_URL)) ||
  (typeof window !== "undefined" && window.__KONDOR_API_URL) ||
  null;

const STATIC_API_BASE_URL = preferPageProtocol(
  normalizeApiBaseUrl(configuredApiBaseUrl) ||
    detectSameOriginApiBaseUrl() ||
    "http://localhost:4000"
);

function getCurrentApiBaseUrl() {
  return STATIC_API_BASE_URL;
}

function joinApiUrl(base, path) {
  const normalizedBase = String(base || "").replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function normalizeApiPath(path) {
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  while (/^\/api\/api(?=\/|$)/i.test(normalizedPath)) {
    normalizedPath = normalizedPath.replace(/^\/api\/api(?=\/|$)/i, API_PREFIX);
  }
  if (
    normalizedPath === API_PREFIX ||
    normalizedPath.startsWith(`${API_PREFIX}/`)
  ) {
    return normalizedPath;
  }
  return `${API_PREFIX}${normalizedPath}`;
}

// --------------------
// Helpers de storage
// --------------------

const STORAGE_KEY = "kondor_auth";
const PERSIST_TOKENS =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_PERSIST_TOKENS === "true") ||
  (typeof window !== "undefined" && window.__KONDOR_PERSIST_TOKENS === true);

function loadAuthFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error loading auth from storage", err);
    return null;
  }
}

function saveAuthToStorage(data) {
  if (typeof window === "undefined") return;
  try {
    if (!data) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const sanitized = {
      user: data.user || null,
      tenant: data.tenant || null,
      subscription: data.subscription || null,
      ...(PERSIST_TOKENS
        ? {
            accessToken: data.accessToken || null,
            refreshToken: data.refreshToken || null,
            tokenId: data.tokenId || null,
          }
        : {}),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (err) {
    console.error("Error saving auth to storage", err);
  }
}

function clearAuthFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Error clearing auth from storage", err);
  }
}

function getAccessToken() {
  const data = loadAuthFromStorage();
  return data?.accessToken || null;
}

function getRefreshToken() {
  const data = loadAuthFromStorage();
  return data?.refreshToken || null;
}

function getTokenId() {
  const data = loadAuthFromStorage();
  return data?.tokenId || null;
}

// --------------------
// AUTO-REFRESH TOKEN (FASE 5)
// --------------------

let isRefreshing = false;
let refreshQueue = [];

async function autoRefreshWrapper(fetchFn, path, options = {}) {
  try {
    return await fetchFn(path, options);
  } catch (err) {
    if (err.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        const ok = await tryRefreshToken();
        isRefreshing = false;

        refreshQueue.forEach((cb) => cb(ok));
        refreshQueue = [];

        if (!ok) {
          clearAuthFromStorage();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          throw err;
        }
      }

      return new Promise((resolve, reject) => {
        refreshQueue.push((ok) => {
          if (!ok) return reject(err);
          resolve(fetchFn(path, options));
        });
      });
    }
    throw err;
  }
}

// --------------------
// Helpers de HTTP
// --------------------

async function rawFetch(path, options = {}) {
  const normalizedPath = normalizeApiPath(path);
  const base = getCurrentApiBaseUrl();
  const url = joinApiUrl(base, normalizedPath);

  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  const opts = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
    credentials: options.credentials || "include",
  };
  if (options && options.body && typeof options.body !== "string") {
    opts.body = JSON.stringify(options.body);
  }

  return fetch(url, opts);
}

function buildApiUrl(path) {
  return joinApiUrl(getCurrentApiBaseUrl(), normalizeApiPath(path));
}

function buildQuery(params) {
  if (!params || typeof params !== "object") return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// --------------------
// Fetch com auth (access token)
// --------------------

async function authedFetch(path, options = {}) {
  const token = getAccessToken();

  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await rawFetch(path, {
    ...options,
    headers,
  });

  return res;
}

// --------------------
// Wrapper com JSON + erro + auto-refresh
// --------------------

async function jsonFetch(path, options = {}) {
  return autoRefreshWrapper(_jsonFetchInternal, path, options);
}

async function _jsonFetchInternal(path, options = {}) {
  const res = await authedFetch(path, options);

  let data = null;
  try {
    data = await res.json();
  } catch (err) {}

  if (!res.ok) {
    if (
      typeof window !== "undefined" &&
      (res.status === 402 || res.status === 403)
    ) {
      try {
        window.dispatchEvent(
          new CustomEvent("subscription_expired", {
            detail: { status: res.status, data },
          })
        );
      } catch (e) {}
    }

    if (
      typeof window !== "undefined" &&
      res.status === 409 &&
      (data?.code === "REAUTH_REQUIRED" ||
        data?.code === "GA4_REAUTH_REQUIRED")
    ) {
      try {
        window.dispatchEvent(
          new CustomEvent("ga4_reauth_required", {
            detail: { status: res.status, data },
          })
        );
      } catch (e) {}
    }

    const error = new Error(data?.error || "Request failed");
    error.status = res.status;
    error.data = data;
    error.code = data?.code || null;
    throw error;
  }

  return data;
}

function stripDateRangePreset(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const dateRange = payload.dateRange;
  if (!dateRange || typeof dateRange !== "object") return payload;
  if (!Object.prototype.hasOwnProperty.call(dateRange, "preset")) return payload;
  const nextDateRange = { ...dateRange };
  delete nextDateRange.preset;
  return { ...payload, dateRange: nextDateRange };
}

function shouldRetryWithoutDateRangePreset(err) {
  if (!err || Number(err.status) !== 400) return false;
  const code = String(err?.data?.error?.code || err?.data?.code || "").toUpperCase();
  if (code !== "VALIDATION_ERROR") return false;

  const fieldErrors = err?.data?.error?.details?.fieldErrors || {};
  const dateRangeErrors = Array.isArray(fieldErrors?.dateRange)
    ? fieldErrors.dateRange
    : [];
  if (!dateRangeErrors.length) return false;

  // Zod strict() default message for unknown keys is `Unrecognized key: "preset"`.
  const joined = dateRangeErrors.join(" ").toLowerCase();
  return joined.includes("unrecognized key") && joined.includes("preset");
}

let supportsMetricsDateRangePreset = true;

function extractFilenameFromDisposition(disposition) {
  if (!disposition) return null;
  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (err) {
      return utf8Match[1];
    }
  }
  const basicMatch = disposition.match(/filename\s*=\s*\"?([^\";]+)\"?/i);
  return basicMatch?.[1] || null;
}

async function blobFetch(path, options = {}) {
  return autoRefreshWrapper(_blobFetchInternal, path, options);
}

async function _blobFetchInternal(path, options = {}) {
  const res = await authedFetch(path, options);

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch (err) {}
    const error = new Error(data?.error || "Request failed");
    error.status = res.status;
    error.data = data;
    error.code = data?.code || null;
    throw error;
  }

  const blob = await res.blob();
  const filename = extractFilenameFromDisposition(
    res.headers.get("content-disposition")
  );
  return { blob, filename };
}

// --------------------
// Uploads
// --------------------

async function requestPresignedUpload(file, { folder, isPublic } = {}) {
  if (!file) return null;
  const payload = {
    originalName: file.name || "file",
    contentType: file.type || "application/octet-stream",
    folder,
    public: isPublic ? "true" : "false",
    size: typeof file.size === "number" ? file.size : undefined,
  };
  try {
    return await jsonFetch("/uploads/presign", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (
      err?.status === 400 &&
      err?.data?.code === "DIRECT_UPLOAD_UNAVAILABLE"
    ) {
      return null;
    }
    throw err;
  }
}

async function directUploadWithPresign(file, presign) {
  if (!presign?.uploadUrl) {
    throw new Error("Upload direto inválido");
  }
  const method = presign.method || "PUT";
  const headers = {
    ...(presign.headers || {}),
  };
  if (!headers["Content-Type"]) {
    headers["Content-Type"] =
      file?.type || "application/octet-stream";
  }
  const res = await fetch(presign.uploadUrl, {
    method,
    headers,
    body: file,
  });
  if (!res.ok) {
    const error = new Error("Falha ao enviar arquivo direto ao storage");
    error.status = res.status;
    try {
      error.data = await res.text();
    } catch (_) {}
    throw error;
  }
  return presign;
}

async function uploadFile(file, { folder, isPublic } = {}) {
  if (!file) throw new Error("Arquivo obrigatório para upload");

  // Upload direto (S3 presign) se disponível
  let presign;
  try {
    presign = await requestPresignedUpload(file, { folder, isPublic });
  } catch (err) {
    // Se a falha não for por indisponibilidade, propaga
    if (err?.status !== 400 || err?.data?.code !== "DIRECT_UPLOAD_UNAVAILABLE") {
      throw err;
    }
  }

  if (presign && presign.uploadUrl) {
    await directUploadWithPresign(file, presign);
    return {
      ok: true,
      key: presign.key,
      url: presign.finalUrl || presign.key,
      direct: true,
    };
  }

  if (typeof FormData === "undefined") {
    throw new Error("FormData não disponível neste ambiente");
  }

  const formData = new FormData();
  formData.append("file", file);
  if (folder) formData.append("folder", folder);
  if (typeof isPublic !== "undefined") {
    formData.append("public", isPublic ? "true" : "false");
  }

  const headers = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildApiUrl("/uploads"), {
    method: "POST",
    body: formData,
    headers,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (err) {}

  if (!res.ok) {
    const error = new Error(data?.error || "Falha ao enviar arquivo");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

// --------------------
// Auth
// --------------------

async function login({ email, password }) {
  const res = await rawFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data?.error || "Login failed");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  if (data && !data.mfaRequired) {
    saveAuthToStorage(data);
  }
  return data;
}

async function verifyMfa(payload) {
  const res = await rawFetch("/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data?.error || "Falha ao validar MFA");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  if (data) {
    saveAuthToStorage(data);
  }

  return data;
}

async function logout() {
  try {
    const token = getAccessToken();
    await rawFetch("/auth/logout", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (err) {}
  clearAuthFromStorage();
}

async function registerTenant(payload) {
  const res = await rawFetch("/tenants/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data?.error || "Falha ao registrar tenant");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  saveAuthToStorage(data);

  return data;
}

async function tryRefreshToken() {
  const refreshToken = getRefreshToken();
  const tokenId = getTokenId();

  try {
    const res = await rawFetch("/auth/refresh", {
      method: "POST",
      body: JSON.stringify(
        refreshToken && tokenId ? { refreshToken, tokenId } : {}
      ),
    });

    const data = await res.json();
    if (!res.ok) {
      clearAuthFromStorage();
      return false;
    }

    if (PERSIST_TOKENS) {
      saveAuthToStorage({
        ...loadAuthFromStorage(),
        ...data,
      });
    }

    return true;
  } catch (err) {
    clearAuthFromStorage();
    return false;
  }
}

async function me() {
  return jsonFetch("/auth/me", { method: "GET" });
}

// --------------------
// Helpers gerais de CRUD
// --------------------

function normalizeListResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return payload || [];
}

function createEntityClient(basePath) {
  const client = {
    async list(params) {
      const qs = buildQuery(params);
      const data = await jsonFetch(`${basePath}${qs}`, { method: "GET" });
      return normalizeListResponse(data);
    },

    async get(id) {
      return jsonFetch(`${basePath}/${id}`, { method: "GET" });
    },

    async create(payload) {
      return jsonFetch(basePath, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async update(id, payload) {
      return jsonFetch(`${basePath}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },

    async delete(id) {
      return jsonFetch(`${basePath}/${id}`, { method: "DELETE" });
    },

    async deleteLocal(id) {
      return jsonFetch(`${basePath}/${id}?localOnly=1`, { method: "DELETE" });
    },
  };

  client.remove = client.delete;
  return client;
}

// --------------------
// Clients
// --------------------

const Clients = createEntityClient("/clients");
const Client = Clients;

// --------------------
// Posts
// --------------------

const Posts = {
  ...createEntityClient("/posts"),

  async listKanban(params) {
    const qs = buildQuery({ ...(params || {}), view: "kanban" });
    return jsonFetch(`/posts${qs}`, { method: "GET" });
  },

  async listCalendar(params) {
    const qs = buildQuery({ ...(params || {}), view: "calendar" });
    return jsonFetch(`/posts${qs}`, { method: "GET" });
  },

  async sendToApproval(id) {
    return jsonFetch(`/posts/${id}/send-to-approval`, { method: "POST" });
  },
};
const Post = Posts;

// --------------------
// Approvals
// --------------------

const Approvals = {
  async list(params) {
    const qs = buildQuery(params);
    return jsonFetch(`/approvals${qs}`, { method: "GET" });
  },

  async get(id) {
    return jsonFetch(`/approvals/${id}`, { method: "GET" });
  },

  async approve(id, payload) {
    return jsonFetch(`/approvals/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async reject(id, payload) {
    return jsonFetch(`/approvals/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};
const Approval = Approvals;

// --------------------
// Metrics
// --------------------

const Metrics = {
  async overview(params) {
    const qs = buildQuery(params);
    return jsonFetch(`/metrics/overview${qs}`, { method: "GET" });
  },

  async campaigns(params) {
    const qs = buildQuery(params);
    return jsonFetch(`/metrics/campaigns${qs}`, { method: "GET" });
  },
};

// --------------------
// Reports V2 (new endpoints)
// --------------------

const ReportsV2 = {
  async listDashboards(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/reports/dashboards${qs}`, { method: "GET" });
  },

  async createDashboard(payload = {}) {
    return jsonFetch("/reports/dashboards", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async deleteDashboard(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}`, { method: "DELETE" });
  },

  async getDashboard(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}`, { method: "GET" });
  },

  async getDashboardHealth(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/health`, { method: "GET" });
  },

  async listTemplates() {
    return jsonFetch("/reports/templates", { method: "GET" });
  },

  async createTemplate(payload = {}) {
    return jsonFetch("/reports/templates", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async instantiateTemplate(id, payload = {}) {
    if (!id) throw new Error("templateId obrigatorio");
    return jsonFetch(`/reports/templates/${id}/instantiate`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async createDashboardVersion(id, payload = {}) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/versions`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async listDashboardVersions(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/versions`, { method: "GET" });
  },

  async publishDashboard(id, payload = {}) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/publish`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async createExport(id, payload = {}) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/exports`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async exportPdf(id, payload = {}) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return blobFetch(`/reports/dashboards/${id}/export-pdf`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async getPublicShareStatus(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/public-share`, { method: "GET" });
  },

  async createPublicShare(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/public-share`, { method: "POST" });
  },

  async rotatePublicShare(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/public-share/rotate`, { method: "POST" });
  },

  async revokePublicShare(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/public-share`, { method: "DELETE" });
  },

  async createShare(id) {
    return this.createPublicShare(id);
  },

  async disableShare(id) {
    return this.revokePublicShare(id);
  },

  async rollbackDashboard(id, payload = {}) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/rollback`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async cloneDashboard(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/reports/dashboards/${id}/clone`, { method: "POST" });
  },

  async queryMetrics(payload = {}) {
    try {
      const effectivePayload = supportsMetricsDateRangePreset
        ? payload || {}
        : stripDateRangePreset(payload || {});
      return await jsonFetch("/metrics/query", {
        method: "POST",
        body: JSON.stringify(effectivePayload),
      });
    } catch (err) {
      if (!shouldRetryWithoutDateRangePreset(err)) throw err;
      supportsMetricsDateRangePreset = false;
      const stripped = stripDateRangePreset(payload || {});
      return jsonFetch("/metrics/query", {
        method: "POST",
        body: JSON.stringify(stripped || {}),
      });
    }
  },

  async listConnections(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/reports/connections${qs}`, { method: "GET" });
  },

  async getConnectionsStatus(brandId) {
    if (!brandId) throw new Error("brandId obrigatorio");
    const qs = buildQuery({ brandId });
    return jsonFetch(`/reports/connections${qs}`, { method: "GET" });
  },

  async listAvailableConnections(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/reports/connections/available${qs}`, { method: "GET" });
  },

  async linkConnection(payload = {}) {
    return jsonFetch("/reports/connections", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};

// --------------------
// Reports V2 Public
// --------------------

const PublicReports = {
  async getReport(token) {
    if (!token) throw new Error("token obrigatorio");
    return jsonFetch(`/public/reports/${token}`, { method: "GET" });
  },

  async queryMetrics(payload = {}) {
    try {
      const effectivePayload = supportsMetricsDateRangePreset
        ? payload || {}
        : stripDateRangePreset(payload || {});
      return await jsonFetch("/public/metrics/query", {
        method: "POST",
        body: JSON.stringify(effectivePayload),
      });
    } catch (err) {
      if (!shouldRetryWithoutDateRangePreset(err)) throw err;
      supportsMetricsDateRangePreset = false;
      const stripped = stripDateRangePreset(payload || {});
      return jsonFetch("/public/metrics/query", {
        method: "POST",
        body: JSON.stringify(stripped || {}),
      });
    }
  },
};

// --------------------
// GA4 + Analytics
// --------------------

const GA4 = {
  async oauthStart(options = {}) {
    const qs = buildQuery(options?.force ? { force: 1 } : {});
    return jsonFetch(`/integrations/ga4/oauth/start${qs}`, { method: "GET" });
  },

  async status() {
    return jsonFetch("/integrations/ga4/status", { method: "GET" });
  },

  async getBrandSettings(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/integrations/ga4/brands/settings${qs}`, { method: "GET" });
  },

  async upsertBrandSettings(payload = {}) {
    return jsonFetch("/integrations/ga4/brands/settings", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async syncFacts(payload = {}) {
    return jsonFetch("/integrations/ga4/facts/sync", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async disconnect() {
    return jsonFetch("/integrations/ga4/disconnect", { method: "POST" });
  },

  async syncProperties() {
    return jsonFetch("/integrations/ga4/properties/sync", { method: "GET" });
  },

  async listProperties() {
    return jsonFetch("/integrations/ga4/properties", { method: "GET" });
  },

  async selectProperty(propertyId) {
    if (!propertyId) throw new Error("propertyId obrigatorio");
    return jsonFetch("/integrations/ga4/properties/select", {
      method: "POST",
      body: JSON.stringify({ propertyId }),
    });
  },

  async metadata(propertyId) {
    const qs = buildQuery(propertyId ? { propertyId } : {});
    return jsonFetch(`/integrations/ga4/metadata${qs}`, { method: "GET" });
  },

  async demoReport(payload = {}) {
    return jsonFetch("/integrations/ga4/demo-report", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};

const Analytics = {
  async runReport(payload = {}) {
    return jsonFetch("/analytics/ga4/run-report", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async listDashboards() {
    return jsonFetch("/analytics/dashboards", { method: "GET" });
  },

  async getDashboard(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/analytics/dashboards/${id}`, { method: "GET" });
  },

  async createDashboard(payload = {}) {
    return jsonFetch("/analytics/dashboards", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async updateDashboard(id, payload = {}) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/analytics/dashboards/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload || {}),
    });
  },

  async deleteDashboard(id) {
    if (!id) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/analytics/dashboards/${id}`, { method: "DELETE" });
  },

  async createWidget(dashboardId, payload = {}) {
    if (!dashboardId) throw new Error("dashboardId obrigatorio");
    return jsonFetch(`/analytics/dashboards/${dashboardId}/widgets`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async updateWidget(widgetId, payload = {}) {
    if (!widgetId) throw new Error("widgetId obrigatorio");
    return jsonFetch(`/analytics/widgets/${widgetId}`, {
      method: "PUT",
      body: JSON.stringify(payload || {}),
    });
  },

  async deleteWidget(widgetId) {
    if (!widgetId) throw new Error("widgetId obrigatorio");
    return jsonFetch(`/analytics/widgets/${widgetId}`, { method: "DELETE" });
  },

  async previewWidget(payload = {}) {
    return jsonFetch("/analytics/widgets/preview", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};

// --------------------
// Tasks
// --------------------

const Tasks = createEntityClient("/tasks");
const Task = Tasks;

// --------------------
// Financial Records
// --------------------

const FinancialRecord = createEntityClient("/finance");

// --------------------
// Creatives / Biblioteca
// --------------------

const Creative = createEntityClient("/creatives");

// --------------------
// Integrations
// --------------------

const Integration = createEntityClient("/integrations");

// --------------------
// Competitors
// --------------------

const Competitor = {
  ...createEntityClient("/competitors"),

  async listSnapshots(id, params) {
    const qs = buildQuery(params);
    return jsonFetch(`/competitors/${id}/snapshots${qs}`, { method: "GET" });
  },

  async compare(params) {
    const qs = buildQuery(params);
    return jsonFetch(`/competitors/compare${qs}`, { method: "GET" });
  },

  async createSnapshot(id, payload) {
    return jsonFetch(`/competitors/${id}/snapshots`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async sync(id) {
    return jsonFetch(`/competitors/${id}/sync`, { method: "POST" });
  },
};

// --------------------
// Metrics (CRUD + filtros customizados)
// --------------------

const Metric = {
  ...createEntityClient("/metrics"),
  async filter(filters = {}, order, limit) {
    const params =
      filters && typeof filters === "object" && !Array.isArray(filters)
        ? { ...filters }
        : {};
    if (order) params.order = order;
    if (typeof limit !== "undefined") params.perPage = limit;
    const qs = buildQuery(params);
    const response = await jsonFetch(`/metrics${qs}`, { method: "GET" });
    if (response && Array.isArray(response.items)) {
      return response.items;
    }
    return Array.isArray(response) ? response : [];
  },
};

// --------------------
// Tenant (tema / branding)
// --------------------

const Tenant = {
  async list(params) {
    const qs = buildQuery(params);
    const data = await jsonFetch(`/tenants${qs}`, { method: "GET" });
    return normalizeListResponse(data);
  },

  async getCurrent() {
    return jsonFetch("/dashboard/tenant", { method: "GET" });
  },

  async update(idOrPayload, maybePayload) {
    const payload =
      typeof idOrPayload === "string" || typeof idOrPayload === "number"
        ? maybePayload
        : idOrPayload;
    return jsonFetch("/tenants/current", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};

// --------------------
// Dashboard
// --------------------

const Dashboard = {
  async overview() {
    return jsonFetch("/dashboard/overview", { method: "GET" });
  },

  async summary(params) {
    const qs = buildQuery(params);
    return jsonFetch(`/dashboard/summary${qs}`, { method: "GET" });
  },
};

// --------------------
// Aprovação pública
// --------------------

const PublicApprovals = {
  async getPublicApproval(token) {
    return jsonFetch(`/public/approvals/${token}`, { method: "GET" });
  },

  async publicApprove(token, payload) {
    return jsonFetch(`/public/approvals/${token}/approve`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async publicReject(token, payload) {
    return jsonFetch(`/public/approvals/${token}/reject`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async publicRequestChanges(token, payload) {
    return jsonFetch(`/public/approvals/${token}/request-changes`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};

// --------------------
// Billing
// --------------------

const Billing = {
  async getPlans() {
    return jsonFetch("/billing/plans", { method: "GET" });
  },

  async getStatus() {
    return jsonFetch("/billing/status", { method: "GET" });
  },

  async subscribe(planId) {
    return jsonFetch("/billing/subscribe", {
      method: "POST",
      body: JSON.stringify({ planId }),
    });
  },
};

// --------------------
// Equipe / Team
// --------------------

const TeamMember = {
  async list() {
    return jsonFetch("/team", { method: "GET" });
  },

  async create(payload) {
    return jsonFetch("/team", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async update(id, payload) {
    return jsonFetch(`/team/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async remove(id) {
    return jsonFetch(`/team/${id}`, { method: "DELETE" });
  },
};

// --------------------
// Admin Control Center
// --------------------

const Admin = {
  async overview() {
    return jsonFetch("/admin/overview", { method: "GET" });
  },

  async tenants(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/admin/tenants${qs}`, { method: "GET" });
  },

  async tenant(id) {
    if (!id) throw new Error("tenantId é obrigatório");
    return jsonFetch(`/admin/tenants/${id}`, { method: "GET" });
  },

  async updateTenant(id, payload) {
    if (!id) throw new Error("tenantId é obrigatório");
    return jsonFetch(`/admin/tenants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload || {}),
    });
  },

  async logs(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/admin/logs${qs}`, { method: "GET" });
  },

  async jobs(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/admin/jobs${qs}`, { method: "GET" });
  },

  async impersonate(userId) {
    if (!userId) throw new Error("userId é obrigatório");
    return jsonFetch(`/admin/impersonate`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  },

  async stopImpersonation(payload = {}) {
    return jsonFetch(`/admin/impersonate/stop`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async tenantNotes(tenantId) {
    if (!tenantId) throw new Error("tenantId é obrigatório");
    return jsonFetch(`/admin/tenants/${tenantId}/notes`, { method: "GET" });
  },

  async createTenantNote(tenantId, payload) {
    if (!tenantId) throw new Error("tenantId é obrigatório");
    return jsonFetch(`/admin/tenants/${tenantId}/notes`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async users(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/admin/users${qs}`, { method: "GET" });
  },

  async updateUser(id, payload) {
    if (!id) throw new Error("userId é obrigatório");
    return jsonFetch(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload || {}),
    });
  },

  async resetUserPassword(id) {
    if (!id) throw new Error("userId é obrigatório");
    return jsonFetch(`/admin/users/${id}/reset-password`, { method: "POST" });
  },

  async forceUserLogout(id) {
    if (!id) throw new Error("userId é obrigatório");
    return jsonFetch(`/admin/users/${id}/force-logout`, { method: "POST" });
  },

  async integrations(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/admin/integrations${qs}`, { method: "GET" });
  },

  async updateIntegration(id, payload) {
    if (!id) throw new Error("integrationId é obrigatório");
    return jsonFetch(`/admin/integrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload || {}),
    });
  },

  async disconnectIntegration(id) {
    if (!id) throw new Error("integrationId é obrigatório");
    return jsonFetch(`/admin/integrations/${id}/disconnect`, {
      method: "POST",
    });
  },

  async billingTenants(params = {}) {
    const qs = buildQuery(params);
    return jsonFetch(`/admin/billing/tenants${qs}`, { method: "GET" });
  },

  async syncTenantBilling(id) {
    if (!id) throw new Error("tenantId é obrigatório");
    return jsonFetch(`/admin/billing/tenants/${id}/sync`, { method: "POST" });
  },

  async cancelSubscription(id, payload = {}) {
    if (!id) throw new Error("subscriptionId é obrigatório");
    return jsonFetch(`/admin/billing/subscriptions/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async dataTables() {
    return jsonFetch("/admin/data/tables", { method: "GET" });
  },

  async dataQuery(payload) {
    return jsonFetch("/admin/data/query", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  async dataExecute(payload) {
    return jsonFetch("/admin/data/execute", {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },
};

const Me = {
  async getPreferences() {
    return jsonFetch("/me/preferences", { method: "GET" });
  },

  async updatePreferences(payload) {
    return jsonFetch("/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(payload || {}),
    });
  },
};

// --------------------
// Export principal
// --------------------

export const base44 = {
  get API_BASE_URL() {
    return getCurrentApiBaseUrl();
  },
  rawFetch,
  jsonFetch,
  authedFetch,
  auth: {
    login,
    verifyMfa,
    registerTenant,
    logout,
    tryRefreshToken,
    me,
  },
  entities: {
    Client,
    Clients,
    Post,
    Posts,
    Task,
    Tasks,
    Metrics,
    Metric,
    Approvals,
    Approval,
    PublicApprovals,
    Billing,
    Tenant,
    TeamMember,
    Dashboard,
    FinancialRecord,
    Creative,
    Integration,
    Competitor,
  },
  reportsV2: ReportsV2,
  publicReports: PublicReports,
  ga4: GA4,
  analytics: Analytics,
  uploads: {
    uploadFile,
  },
  storage: {
    loadAuthFromStorage,
    saveAuthFromStorage: saveAuthToStorage,
    clearAuthFromStorage,
    getAccessToken,
    getRefreshToken,
  },
  me: Me,
  admin: Admin,
};
