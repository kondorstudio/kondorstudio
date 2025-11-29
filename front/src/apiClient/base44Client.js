// apiClient/base44Client.js

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:4000";

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
    console.error("Error clearing auth storage", err);
  }
}

function getAccessToken() {
  const auth = loadAuthFromStorage();
  return auth?.accessToken || null;
}

function getRefreshToken() {
  const auth = loadAuthFromStorage();
  return auth?.refreshToken || null;
}

function getTokenId() {
  const auth = loadAuthFromStorage();
  return auth?.tokenId || null;
}

// --------------------
// Helpers de HTTP
// --------------------

async function rawFetch(path, options = {}) {
  const url = API_BASE_URL.replace(/\/+$/, "") + path;
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

  const res = await fetch(url, opts);
  return res;
}

function buildQuery(params) {
  if (!params || typeof params !== "object") return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function authFetch(path, options = {}, allowRetry = true) {
  const accessToken = getAccessToken();

  const headers = {
    ...(options.headers || {}),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await rawFetch(path, {
    ...options,
    headers,
  });

  if (res.status === 401 && allowRetry) {
    const refreshed = await tryRefreshToken();
    if (!refreshed) {
      clearAuthFromStorage();
      throw new Error("unauthorized");
    }
    const resRetry = await authFetch(path, options, false);
    return resRetry;
  }

  return res;
}

async function parseJsonOrThrow(res) {
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const message =
      data?.error ||
      data?.message ||
      `Request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
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

  const data = await parseJsonOrThrow(res);

  const tenant =
    data.tenant != null
      ? data.tenant
      : data.user?.tenantId != null
      ? data.user.tenantId
      : null;

  saveAuthToStorage({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tokenId: data.tokenId,
    user: data.user,
    tenant,
    expiresAt: data.expiresAt || null,
  });

  return data;
}

async function me() {
  const res = await authFetch("/me", { method: "GET" });
  const data = await parseJsonOrThrow(res);
  return data;
}

async function logout() {
  const refreshToken = getRefreshToken();
  try {
    await rawFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err) {
    console.error("logout error", err);
  }
  clearAuthFromStorage();
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

    // Se falhar (400/401/etc), não tenta de novo
    if (!res.ok) return false;

    const data = await res.json();

    const current = loadAuthFromStorage() || {};
    const tenant =
      current.tenant != null
        ? current.tenant
        : data.tenant != null
        ? data.tenant
        : current.user?.tenantId ?? null;

    saveAuthToStorage({
      ...current,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenId: data.tokenId,
      tenant,
      expiresAt: data.expiresAt || current.expiresAt || null,
    });

    return true;
  } catch (err) {
    console.error("refresh token error", err);
    return false;
  }
}

// --------------------
// CRUD genérico
// --------------------

function buildCrudEntity(basePath) {
  return {
    async list(params) {
      const query = buildQuery(params);
      const res = await authFetch(`${basePath}${query}`, { method: "GET" });
      return parseJsonOrThrow(res);
    },
    async filter(params, sort, limit) {
      const queryParams = { ...(params || {}) };
      if (sort) queryParams._sort = sort;
      if (limit) queryParams._limit = limit;
      const query = buildQuery(queryParams);
      const res = await authFetch(`${basePath}${query}`, { method: "GET" });
      return parseJsonOrThrow(res);
    },
    async get(id) {
      const res = await authFetch(`${basePath}/${id}`, { method: "GET" });
      return parseJsonOrThrow(res);
    },
    async create(payload) {
      const res = await authFetch(basePath, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow(res);
    },
    async update(id, payload) {
      const res = await authFetch(`${basePath}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      return parseJsonOrThrow(res);
    },
    async remove(id) {
      const res = await authFetch(`${basePath}/${id}`, { method: "DELETE" });
      return parseJsonOrThrow(res);
    },
    async delete(id) {
      return this.remove(id);
    },
  };
}

// --------------------
// Entidades
// --------------------

const Client = buildCrudEntity("/clients");
const Post = buildCrudEntity("/posts");
const Task = buildCrudEntity("/tasks");
const FinancialRecord = buildCrudEntity("/financial-records");
const Integration = buildCrudEntity("/integrations");
const Metric = buildCrudEntity("/metrics");
const Creative = buildCrudEntity("/creatives");
const Report = buildCrudEntity("/reports");
const TeamMember = buildCrudEntity("/team-members");
const Tenant = buildCrudEntity("/tenants");

// Approval: CRUD genérico + métodos específicos de workflow
const ApprovalBase = buildCrudEntity("/approvals");

const Approval = {
  ...ApprovalBase,

  /**
   * Atualiza o status de uma approval via endpoint dedicado.
   * Ex: Approval.updateStatus(id, { status: "APPROVED", clientFeedback: "ok" })
   */
  async updateStatus(id, payload = {}) {
    const res = await authFetch(`/approvals/${id}/status`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return parseJsonOrThrow(res);
  },

  /**
   * Atalho para aprovar uma approval.
   * Ex: Approval.approve(id, { clientFeedback: "ok" })
   */
  async approve(id, payload = {}) {
    const data = {
      ...payload,
      status: "APPROVED",
    };
    return this.updateStatus(id, data);
  },

  /**
   * Atalho para rejeitar uma approval.
   * Ex: Approval.reject(id, { clientFeedback: "ajustar legenda" })
   */
  async reject(id, payload = {}) {
    const data = {
      ...payload,
      status: "REJECTED",
    };
    return this.updateStatus(id, data);
  },
};

// Dashboard (não é CRUD padrão)
const Dashboard = {
  async summary(params) {
    const query = buildQuery(params);
    const res = await authFetch(`/dashboard/summary${query}`, {
      method: "GET",
    });
    return parseJsonOrThrow(res);
  },
};

// --------------------
// Export
// --------------------

export const base44 = {
  auth: {
    login,
    me,
    logout,
    tryRefreshToken,
  },
  entities: {
    Client,
    Post,
    Task,
    FinancialRecord,
    Integration,
    Metric,
    Creative,
    Report,
    TeamMember,
    Tenant,
    Approval,
    Dashboard,
  },
  storage: {
    loadAuthFromStorage,
    saveAuthToStorage,
    clearAuthFromStorage,
    getAccessToken,
    getRefreshToken,
  },
};
