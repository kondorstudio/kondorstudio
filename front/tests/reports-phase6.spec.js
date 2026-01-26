import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const ARTIFACT_DIR = path.resolve(process.cwd(), "test-artifacts/phase6");

const AUTH_PAYLOAD = {
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  tokenId: "token-123",
  user: {
    id: "user-1",
    name: "QA Tester",
    role: "ADMIN",
  },
};

function createMockState(overrides = {}) {
  const defaultDashboard = {
    id: "dash-1",
    name: "Dashboard QA",
    scope: "TENANT",
    brandId: null,
    groupId: null,
    widgetsSchema: [
      {
        id: "w1",
        widgetType: "KPI",
        title: "Impressions",
        source: "META_ADS",
        level: "CAMPAIGN",
        metrics: ["impressions"],
        breakdown: "",
        connectionId: "",
        brandId: "",
        inheritBrand: true,
        filters: {},
        options: {},
      },
    ],
    layoutSchema: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
    globalFiltersSchema: {
      dateFrom: "2024-01-01",
      dateTo: "2024-01-31",
      compareMode: "NONE",
      brandId: "brand-1",
      groupId: null,
    },
  };

  return {
    brandId: "brand-1",
    clients: [{ id: "brand-1", name: "Marca Alpha" }],
    brandGroups: [],
    groupMembersByGroup: {},
    connectionsByBrand: { "brand-1": [] },
    integrations: [
      {
        id: "int-1",
        provider: "META",
        providerName: "Meta",
        settings: { kind: "meta_ads" },
      },
    ],
    accountsByIntegration: {
      "int-1": [{ id: "acc-1", displayName: "Conta Meta 1" }],
    },
    dashboards: { "dash-1": defaultDashboard },
    widgetQueryMode: "ok",
    widgetQueryErrorOnce: false,
    widgetQueryCount: 0,
    lastWidgetQueryPayloads: [],
    ...overrides,
  };
}

const CORS_ORIGIN = "http://127.0.0.1:5173";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

async function setupMockApi(page, state) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname, searchParams } = url;
    const method = request.method();

    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders() });
    }

    const fulfillJson = (status, data) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: corsHeaders(),
        body: JSON.stringify(data),
      });

    if (pathname === "/api/auth/login" && method === "POST") {
      return fulfillJson(200, AUTH_PAYLOAD);
    }

    if (pathname === "/api/clients" && method === "GET") {
      return fulfillJson(200, state.clients);
    }

    if (pathname === "/api/reporting/brand-groups" && method === "GET") {
      return fulfillJson(200, { items: state.brandGroups });
    }

    if (pathname.startsWith("/api/reporting/brand-groups/") && pathname.endsWith("/members")) {
      const groupId = pathname.split("/")[4];
      const members = state.groupMembersByGroup[groupId] || [];
      return fulfillJson(200, { items: members });
    }

    if (pathname.startsWith("/api/reporting/brands/") && pathname.endsWith("/connections")) {
      const brandId = pathname.split("/")[4];
      const items = state.connectionsByBrand[brandId] || [];
      return fulfillJson(200, { items });
    }

    if (
      pathname.startsWith("/api/reporting/brands/") &&
      pathname.endsWith("/connections/link") &&
      method === "POST"
    ) {
      const brandId = pathname.split("/")[4];
      const payload = JSON.parse(request.postData() || "{}");
      const connection = {
        id: `conn-${Date.now()}`,
        brandId,
        source: payload.source,
        status: "CONNECTED",
        displayName: payload.displayName || "Conta conectada",
        integrationId: payload.integrationId || null,
        externalAccountId: payload.externalAccountId || null,
      };
      state.connectionsByBrand[brandId] = state.connectionsByBrand[brandId] || [];
      state.connectionsByBrand[brandId].push(connection);
      return fulfillJson(201, connection);
    }

    if (pathname === "/api/integrations" && method === "GET") {
      return fulfillJson(200, state.integrations);
    }

    if (pathname.startsWith("/api/reporting/integrations/") && pathname.endsWith("/accounts")) {
      const integrationId = pathname.split("/")[4];
      const items = state.accountsByIntegration[integrationId] || [];
      return fulfillJson(200, { items });
    }

    if (pathname === "/api/reporting/metric-catalog" && method === "GET") {
      const level = searchParams.get("level");
      if (!level) {
        return fulfillJson(200, {
          items: [{ level: "CAMPAIGN" }],
        });
      }
      return fulfillJson(200, {
        items: [
          { metricKey: "impressions", label: "Impressions" },
          { metricKey: "clicks", label: "Clicks" },
        ],
      });
    }

    if (pathname === "/api/reporting/dimensions" && method === "GET") {
      return fulfillJson(200, {
        items: [{ metricKey: "date_start", label: "Data" }],
      });
    }

    if (pathname === "/api/reporting/metrics/query" && method === "POST") {
      state.widgetQueryCount += 1;
      const payload = JSON.parse(request.postData() || "{}");
      state.lastWidgetQueryPayloads.push(payload);

      if (state.widgetQueryMode === "error") {
        return fulfillJson(500, { error: "Erro simulado" });
      }
      if (state.widgetQueryMode === "error-once") {
        if (state.widgetQueryErrorOnce) {
          state.widgetQueryErrorOnce = false;
          return fulfillJson(500, { error: "Erro simulado" });
        }
      }
      if (state.widgetQueryMode === "empty") {
        return fulfillJson(200, {
          totals: {},
          series: [],
          table: { columns: [], rows: [] },
        });
      }

      const metrics = Array.isArray(payload.metrics) ? payload.metrics : [];
      const totals = metrics.reduce((acc, key) => {
        acc[key] = 120;
        return acc;
      }, {});

      return fulfillJson(200, {
        totals,
        series: metrics.length
          ? [{ name: metrics[0], data: [{ x: "2024-01-01", y: 10 }] }]
          : [],
        table: { columns: [], rows: [] },
        meta: {},
      });
    }

    if (pathname === "/api/reporting/dashboards" && method === "GET") {
      return fulfillJson(200, { items: Object.values(state.dashboards) });
    }

    if (pathname.startsWith("/api/reporting/dashboards/") && method === "GET") {
      const dashboardId = pathname.split("/")[4];
      const dashboard = state.dashboards[dashboardId];
      if (!dashboard) {
        return fulfillJson(404, { error: "Dashboard nao encontrado" });
      }
      return fulfillJson(200, dashboard);
    }

    if (pathname === "/api/reporting/dashboards" && method === "POST") {
      const payload = JSON.parse(request.postData() || "{}");
      const dashboardId = `dash-${Date.now()}`;
      const dashboard = { id: dashboardId, ...payload };
      state.dashboards[dashboardId] = dashboard;
      return fulfillJson(201, dashboard);
    }

    return fulfillJson(200, { ok: true });
  });
}

async function setupAuthAndPatches(page, { shortenIntervals = false } = {}) {
  await page.addInitScript(
    ({ auth, shorten }) => {
      window.localStorage.setItem("kondor_auth", JSON.stringify(auth));

      let isFullscreen = false;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => (isFullscreen ? document.documentElement : null),
      });

      const applyFullscreenPatch = () => {
        const root = document.documentElement;
        if (!root) return;
        root.requestFullscreen = async () => {
          isFullscreen = true;
          document.dispatchEvent(new Event("fullscreenchange"));
        };

        document.exitFullscreen = async () => {
          isFullscreen = false;
          document.dispatchEvent(new Event("fullscreenchange"));
        };
      };

      if (document.documentElement) {
        applyFullscreenPatch();
      } else {
        document.addEventListener("DOMContentLoaded", applyFullscreenPatch, {
          once: true,
        });
      }

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        }
      });

      if (shorten) {
        const originalSetInterval = window.setInterval;
        window.setInterval = (fn, delay, ...args) =>
          originalSetInterval(fn, Math.min(delay, 3000), ...args);
      }
    },
    {
      auth: AUTH_PAYLOAD,
      shorten: shortenIntervals,
    }
  );
}

async function selectByLabel(scope, labelText, value) {
  const label = scope.getByText(labelText, { exact: true });
  await expect(label).toBeVisible();
  const field = label.locator("xpath=ancestor::div[1]");
  const select = field.locator("select").first();
  await expect(select).toBeVisible();
  await select.selectOption(value);
}

async function fillByLabel(scope, labelText, value) {
  const label = scope.getByText(labelText, { exact: true });
  await expect(label).toBeVisible();
  const field = label.locator("xpath=ancestor::div[1]");
  const input = field.locator("input").first();
  await expect(input).toBeVisible();
  await input.fill(value);
}

function getDialogContainer(page, title) {
  return page
    .getByRole("heading", { name: title })
    .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')]")
    .first();
}

async function gotoBuilder(page) {
  await page.goto("/reports/dashboards/new", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Builder de dashboards")).toBeVisible();
  const templateDismiss = page.getByRole("button", { name: "Comecar do zero" });
  if (await templateDismiss.isVisible()) {
    await templateDismiss.click();
  }
  await expect(page.getByText("Widgets")).toBeVisible();
}

async function addKpiWidget(page, { source, level, metrics = [] }) {
  const widgetsPanel = page.locator("div", { has: page.getByText("Widgets") }).first();
  await widgetsPanel.getByRole("button", { name: /^KPI$/ }).click();
  const dialog = getDialogContainer(page, "Configurar widget");
  await expect(dialog).toBeVisible();

  await selectByLabel(dialog, "Fonte de dados", source);
  await selectByLabel(dialog, "Nivel", level);

  if (metrics.length) {
    const metricButton = dialog.getByRole("button", { name: "Selecione metricas" });
    await metricButton.click();
    for (const metric of metrics) {
      await dialog.getByRole("button", { name: metric }).click();
    }
    await dialog.getByText("Metricas").click();
  }

  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toBeHidden();
}

async function connectMetaAccount(page) {
  const dialog = getDialogContainer(page, "Associar conta");
  await expect(dialog).toBeVisible();
  await selectByLabel(dialog, "Integracao", "int-1");
  await selectByLabel(dialog, "Conta", "acc-1");
  await fillByLabel(dialog, "Nome de exibicao", "Conta Meta 1");
  await dialog.getByRole("button", { name: "Associar" }).click();
  await expect(dialog).toBeHidden();
}

async function selectAutoRefreshHeader(page, value) {
  const select = page
    .locator("select")
    .filter({ hasText: "Auto-refresh" })
    .first();
  await expect(select).toBeVisible();
  await select.selectOption(value);
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => {
    console.log(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
  page.on("requestfailed", (request) => {
    console.log(`[requestfailed] ${request.url()} ${request.failure()?.errorText}`);
  });
});

test("A) Sem conexao (KPI Meta Ads)", async ({ page }) => {
  const state = createMockState();
  await setupAuthAndPatches(page);
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, {
    source: "META_ADS",
    level: "CAMPAIGN",
    metrics: ["Impressions"],
  });

  await expect(page.getByText("Associe uma conta")).toBeVisible();
  await page.getByRole("button", { name: "Associar conta" }).click();
  await connectMetaAccount(page);

  await expect(page.getByText("Associe uma conta")).toBeHidden();
  await expect(page.getByText("120")).toBeVisible();

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "A.png"), fullPage: true });
});

test("B) Sem metricas selecionadas", async ({ page }) => {
  const state = createMockState();
  await setupAuthAndPatches(page);
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, { source: "META_ADS", level: "CAMPAIGN", metrics: [] });

  await expect(page.getByText("Selecione metricas")).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "B.png"), fullPage: true });
});

test("C) Sem dados no periodo", async ({ page }) => {
  const state = createMockState({
    connectionsByBrand: {
      "brand-1": [
        {
          id: "conn-1",
          brandId: "brand-1",
          source: "META_ADS",
          status: "CONNECTED",
          displayName: "Conta Meta",
        },
      ],
    },
    widgetQueryMode: "empty",
  });
  await setupAuthAndPatches(page);
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, {
    source: "META_ADS",
    level: "CAMPAIGN",
    metrics: ["Impressions"],
  });

  await expect(page.getByText("Nenhum dado neste periodo")).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "C.png"), fullPage: true });
});

test("D) Erro forcado + retry", async ({ page }) => {
  const state = createMockState({
    connectionsByBrand: {
      "brand-1": [
        {
          id: "conn-1",
          brandId: "brand-1",
          source: "META_ADS",
          status: "CONNECTED",
          displayName: "Conta Meta",
        },
      ],
    },
    widgetQueryMode: "error",
  });
  await setupAuthAndPatches(page);
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, {
    source: "META_ADS",
    level: "CAMPAIGN",
    metrics: ["Impressions"],
  });

  await expect(page.getByText("Nao foi possivel carregar este widget.")).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "D.png"), fullPage: true });

  state.widgetQueryMode = "ok";
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("120")).toBeVisible();
});

test("E) Last updated apos refresh all", async ({ page }) => {
  const state = createMockState({
    connectionsByBrand: {
      "brand-1": [
        {
          id: "conn-1",
          brandId: "brand-1",
          source: "META_ADS",
          status: "CONNECTED",
          displayName: "Conta Meta",
        },
      ],
    },
  });
  await setupAuthAndPatches(page);
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, {
    source: "META_ADS",
    level: "CAMPAIGN",
    metrics: ["Impressions"],
  });

  await expect(page.getByText("120")).toBeVisible();
  const initialCount = state.widgetQueryCount;
  await page.getByRole("button", { name: "Atualizar dados" }).click();
  await expect.poll(() => state.widgetQueryCount).toBeGreaterThan(initialCount);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "E.png"), fullPage: true });
});

test("F) Auto-refresh 5m sem travar UI", async ({ page }) => {
  const state = createMockState({
    connectionsByBrand: {
      "brand-1": [
        {
          id: "conn-1",
          brandId: "brand-1",
          source: "META_ADS",
          status: "CONNECTED",
          displayName: "Conta Meta",
        },
      ],
    },
  });
  await setupAuthAndPatches(page, { shortenIntervals: true });
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, {
    source: "META_ADS",
    level: "CAMPAIGN",
    metrics: ["Impressions"],
  });

  await selectAutoRefreshHeader(page, "5m");
  const countBefore = state.widgetQueryCount;
  await page.waitForTimeout(6500);
  await expect.poll(() => state.widgetQueryCount).toBeGreaterThan(countBefore + 1);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "F.png"), fullPage: true });
});

test("G) Modo TV oculta sidebar/acoes", async ({ page }) => {
  const state = createMockState({
    connectionsByBrand: {
      "brand-1": [
        {
          id: "conn-1",
          brandId: "brand-1",
          source: "META_ADS",
          status: "CONNECTED",
          displayName: "Conta Meta",
        },
      ],
    },
  });
  await setupAuthAndPatches(page);
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, {
    source: "META_ADS",
    level: "CAMPAIGN",
    metrics: ["Impressions"],
  });

  await page.getByRole("button", { name: "Modo TV" }).click();
  await expect(page.locator("body")).toHaveClass(/tv-mode/);
  const configSidebar = page.locator("aside").filter({ hasText: "Config" }).first();
  const widgetsSidebar = page.locator("aside").filter({ hasText: "Widgets" }).first();
  await expect(configSidebar).toBeHidden();
  await expect(widgetsSidebar).toBeHidden();

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "G.png"), fullPage: true });
});

test("H) ESC sai do fullscreen", async ({ page }) => {
  const state = createMockState({
    connectionsByBrand: {
      "brand-1": [
        {
          id: "conn-1",
          brandId: "brand-1",
          source: "META_ADS",
          status: "CONNECTED",
          displayName: "Conta Meta",
        },
      ],
    },
  });
  await setupAuthAndPatches(page);
  await setupMockApi(page, state);

  await gotoBuilder(page);
  await selectByLabel(page, "Marca global (opcional)", state.brandId);
  await addKpiWidget(page, {
    source: "META_ADS",
    level: "CAMPAIGN",
    metrics: ["Impressions"],
  });

  await page.getByRole("button", { name: "Modo TV" }).click();
  await expect(page.getByRole("button", { name: "Sair do modo TV" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Modo TV" })).toBeVisible();

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "H.png"), fullPage: true });
});

test("I) Auto-refresh em tvMode", async ({ page }) => {
  const state = createMockState({
    connectionsByBrand: {
      "brand-1": [
        {
          id: "conn-1",
          brandId: "brand-1",
          source: "META_ADS",
          status: "CONNECTED",
          displayName: "Conta Meta",
        },
      ],
    },
  });
  await setupAuthAndPatches(page, { shortenIntervals: true });
  await setupMockApi(page, state);

  await page.goto("/reports/dashboards/dash-1");
  await expect(page.getByText("Dashboard QA")).toBeVisible();

  await page.getByRole("button", { name: "Modo TV" }).click();
  await selectByLabel(page, "Auto-refresh", "5m");

  const countBefore = state.widgetQueryCount;
  await page.waitForTimeout(6500);
  await expect.poll(() => state.widgetQueryCount).toBeGreaterThan(countBefore + 1);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "I.png"), fullPage: true });
});
