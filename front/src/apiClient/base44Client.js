// src/apiClient/base44Client.js

// ⚙️ Base URL da API — usando variáveis do Vite, sem "process"
function detectRenderApiUrl() {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host && /onrender\.com$/.test(host)) {
    return "https://kondor-api.onrender.com";
  }
  return null;
}

function detectWindowOrigin() {
  if (typeof window === "undefined") return null;
  const { origin } = window.location || {};
  if (origin && origin.startsWith("http")) {
    return origin;
  }
  return null;
}

function preferPageProtocol(url) {
  if (!url) return url;
  if (typeof window === "undefined") return url;
  const pageProtocol = window.location?.protocol;
  if (!pageProtocol || pageProtocol === "http:") return url;
  try {
    const parsed = new URL(url);
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

const API_BASE_URL = preferPageProtocol(
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_URL || import.meta.env.VITE_APP_API_URL)) ||
    (typeof window !== "undefined" && window.__KONDOR_API_URL) ||
    detectRenderApiUrl() ||
    detectWindowOrigin() ||
    "http://localhost:4000"
);

// --------------------
// Helpers de storage
// --------------------

const STORAGE_KEY = "kondor_auth";

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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
  const base = API_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}/api${normalizedPath}`;

  const defaultHeaders = {
    "Content-Type": "application/json",
  };

  const opts = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  };
  if (options && options.body && typeof options.body !== "string") {
    opts.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, opts);
  return res;
}

function buildApiUrl(path) {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}/api${normalizedPath}`;
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

    const error = new Error(data?.error || "Request failed");
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
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

  if (data?.accessToken) {
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

  if (data?.accessToken) {
    saveAuthToStorage(data);
  }

  return data;
}

async function logout() {
  try {
    await rawFetch("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${getAccessToken()}` },
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

  saveAuthToStorage({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tokenId: data.tokenId || null,
    user: data.user,
    tenant: data.tenant,
    subscription: data.subscription || null,
  });

  return data;
}

async function tryRefreshToken() {
  const refreshToken = getRefreshToken();
  const tokenId = getTokenId();
  if (!refreshToken || !tokenId) return false;

  try {
    const res = await rawFetch("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken, tokenId }),
    });

    const data = await res.json();
    if (!res.ok) {
      clearAuthFromStorage();
      return false;
    }

    saveAuthToStorage({
      ...loadAuthFromStorage(),
      ...data,
    });

    return true;
  } catch (err) {
    clearAuthFromStorage();
    return false;
  }
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

// --------------------
// Export principal
// --------------------

export const base44 = {
  API_BASE_URL,
  rawFetch,
  jsonFetch,
  authedFetch,
  auth: {
    login,
    verifyMfa,
    registerTenant,
    logout,
    tryRefreshToken,
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
  },
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
  admin: Admin,
};
