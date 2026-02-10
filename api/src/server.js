require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
const { prisma } = require("./prisma");

const authMiddleware = require("./middleware/auth");
const tenantMiddleware = require("./middleware/tenant");
const { checkSubscription } = require("./middleware/checkSubscription");
const auditLog = require("./middleware/auditLog");
const errorLogger = require("./middleware/errorLogger");

const app = express();

// Honra X-Forwarded-* headers quando estamos atrás de proxies (Cloudflare / Nginx / LB).
// Sem isso, req.protocol fica como "http" e os links de upload retornam URLs inseguras.
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === "production";
const AUTO_FIX_SCHEMA = process.env.PRISMA_AUTOFIX_SCHEMA === "true";

async function ensureRefreshTokenColumns() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "revoked" BOOLEAN NOT NULL DEFAULT false;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "deviceName" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "ip" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
    `);
  } catch (err) {
    console.warn(
      "Não foi possível verificar colunas de refresh_tokens:",
      err?.message || err
    );
  }
}

async function ensureUserColumns() {
  const statements = [
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;`,
  ];
  try {
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
  } catch (err) {
    console.warn(
      "Não foi possível verificar colunas de users:",
      err?.message || err
    );
  }
}

async function ensureClientOnboardingColumns() {
  const statements = [
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "company" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sector" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "briefing" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "monthlyFeeCents" INTEGER;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "renewalDate" TIMESTAMP(3);`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "website" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "instagram" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "facebook" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "tiktok" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "notes" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "billingContactName" TEXT;`,
    `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "billingContactEmail" TEXT;`,
  ];
  try {
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
  } catch (err) {
    console.warn(
      "Não foi possível verificar colunas de clients:",
      err?.message || err
    );
  }
}

async function ensureFinancialRecordColumns() {
  const statements = [
    `ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "clientId" TEXT;`,
    `ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "note" TEXT;`,
    `ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;`,
  ];
  try {
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
  } catch (err) {
    console.warn(
      "Não foi possível verificar colunas de financial_records:",
      err?.message || err
    );
  }
}

async function ensureTeamMemberColumns() {
  const statements = [
    `ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "salaryCents" INTEGER;`,
    `ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "salaryRecordId" TEXT;`,
  ];
  try {
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
  } catch (err) {
    console.warn(
      "Não foi possível verificar colunas de team_members:",
      err?.message || err
    );
  }
}

async function ensureWhatsAppMessagesTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
        "id" TEXT PRIMARY KEY,
        "tenantId" TEXT,
        "from" TEXT NOT NULL,
        "waMessageId" TEXT,
        "phoneNumberId" TEXT,
        "type" TEXT NOT NULL,
        "textBody" TEXT,
        "rawPayload" JSONB NOT NULL,
        "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_waMessageId_key"
      ON "whatsapp_messages"("waMessageId")
      WHERE "waMessageId" IS NOT NULL;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "whatsapp_messages_tenantId_idx"
      ON "whatsapp_messages"("tenantId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "whatsapp_messages_from_idx"
      ON "whatsapp_messages"("from");
    `);
  } catch (err) {
    console.warn(
      "Não foi possível garantir tabela whatsapp_messages:",
      err?.message || err
    );
  }
}

// Fire-and-forget (não bloqueia o boot)
if (AUTO_FIX_SCHEMA) {
  ensureRefreshTokenColumns();
  ensureUserColumns();
  ensureClientOnboardingColumns();
  ensureFinancialRecordColumns();
  ensureTeamMemberColumns();
  ensureWhatsAppMessagesTable();
} else {
  console.log("🧱 Auto-fix de schema desativado (PRISMA_AUTOFIX_SCHEMA=false).");
}

// Helpers
function safeMount(mountPath, router) {
  if (router && typeof router === "function") {
    app.use(mountPath, router);
  } else {
    console.warn(`⚠️ Rota "${mountPath}" NÃO montada: export inválido.`);
  }
}

// Compat: alguns proxies da DigitalOcean encaminham "/api/*" para o container sem o prefixo "/api".
// Reescrevemos rotas internas conhecidas para manter compatibilidade sem exigir "/api/api/*" no frontend.
const apiCompatPrefixes = [
  "/auth",
  "/client-portal",
  "/public",
  "/webhooks",
  "/integrations",
  "/tenants",
  "/clients",
  "/posts",
  "/tasks",
  "/competitors",
  "/finance",
  "/metrics",
  "/approvals",
  "/uploads",
  "/reports",
  "/reporting",
  "/analytics",
  "/billing",
  "/team",
  "/dashboard",
  "/admin",
  "/me",
  "/automation",
];

function shouldRewriteToApi(pathname, method) {
  if (!pathname) return false;
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname === "/health" || pathname === "/healthz") return false;

  // Mantém assets/redirect públicos de upload funcionando sem autenticação.
  if (pathname === "/uploads/public" || pathname.startsWith("/uploads/public/")) {
    return false;
  }

  // Preserva arquivos estáticos de /uploads/* em GET/HEAD quando não são endpoints protegidos.
  if (pathname.startsWith("/uploads/")) {
    const protectedUploadPaths = new Set([
      "/uploads",
      "/uploads/presign",
      "/uploads/list",
    ]);
    const isProtectedUploadRoute =
      protectedUploadPaths.has(pathname) || /^\/uploads\/[^/]+$/.test(pathname);
    if (!isProtectedUploadRoute && (method === "GET" || method === "HEAD")) {
      return false;
    }
  }

  return apiCompatPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

app.use((req, _res, next) => {
  const currentUrl = req.url || "";
  const queryIndex = currentUrl.indexOf("?");
  const pathname = queryIndex >= 0 ? currentUrl.slice(0, queryIndex) : currentUrl;
  const search = queryIndex >= 0 ? currentUrl.slice(queryIndex) : "";

  if (shouldRewriteToApi(pathname, req.method)) {
    req.url = `/api${pathname}${search}`;
  }

  return next();
});

// CORS configurado antes de qualquer parser, para garantir headers em respostas de erro
const devOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
];
const productionOrigins = [
  "https://kondorstudio.app",
  "https://www.kondorstudio.app",
];

function normalizeOrigin(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch (_) {
    return trimmed.replace(/\/+$/, "");
  }
}

function parseOrigins(raw) {
  return String(raw || "")
    .split(/[,\n;]+/)
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

const corsEnvRaw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "";
const envOrigins = parseOrigins(corsEnvRaw);

const extraOrigins = [
  process.env.APP_URL_FRONT,
  process.env.PUBLIC_APP_URL,
  process.env.APP_PUBLIC_URL,
  process.env.APP_BASE_URL,
  process.env.PUBLIC_APP_BASE_URL,
]
  .map(normalizeOrigin)
  .filter(Boolean);

const defaultOrigins = [
  ...productionOrigins,
  ...(isProduction ? [] : devOrigins),
]
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([...defaultOrigins, ...envOrigins, ...extraOrigins])
);

if (
  isProduction &&
  process.env.CORS_ALLOW_ALL !== "true" &&
  allowedOrigins.length === 0
) {
  console.error(
    "⚠️  Nenhuma origem CORS permitida em produção. Configure CORS_ORIGINS e/ou APP_URL_FRONT."
  );
}

if (
  isProduction &&
  allowedOrigins.length > 0 &&
  allowedOrigins.every((origin) => /localhost|127\.0\.0\.1/i.test(origin))
) {
  console.warn(
    "⚠️  CORS em produção só permite localhost. Configure os domínios públicos (ex.: https://kondorstudio.app)."
  );
}

const allowAllOrigins =
  process.env.CORS_ALLOW_ALL === "true" ||
  (!isProduction && envOrigins.length === 0 && extraOrigins.length === 0);

const corsOptions = {
  origin(origin, callback) {
    if (allowAllOrigins) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (!origin || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.warn(
      `🚫 CORS bloqueado para origem: ${origin} (normalizada: ${normalizedOrigin || "n/a"})`
    );
    const err = new Error("Not allowed by CORS");
    err.status = 403;
    return callback(err);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Tenant",
    "X-Tenant-Id",
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Body parsers (JSON / urlencoded)
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf?.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 🔧 Helmet configurado para permitir recursos cross-origin (imagens, etc.)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  })
);

app.use(morgan(isProduction ? "combined" : "dev"));

// Handler específico para JSON inválido
app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  return next(err);
});

// Static uploads (fallback local storage)
const localUploadsDir =
  process.env.LOCAL_UPLOADS_DIR || path.join(__dirname, "../storage/uploads");
if (!fs.existsSync(localUploadsDir)) {
  fs.mkdirSync(localUploadsDir, { recursive: true });
}
app.use("/uploads", express.static(localUploadsDir));

// Healthcheck
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/healthz", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: "ok", db: "ok" });
  } catch (err) {
    console.error("❌ Healthcheck /healthz falhou:", err);
    return res.status(500).json({ status: "error", db: "error" });
  }
});
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/healthz", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: "ok", db: "ok" });
  } catch (err) {
    console.error("❌ Healthcheck /api/healthz falhou:", err);
    return res.status(500).json({ status: "error", db: "error" });
  }
});

// =========================
// Rotas públicas
// =========================
const authRoutes = require("./routes/auth");
const clientPortalRoutes = require("./routes/clientPortal");
const uploadsPublicRoutes = require("./routes/uploadsPublic");

// ✅ WHATSAPP WEBHOOK (rota pública - Meta não envia seu JWT)
const whatsappWebhookRoutes = require("./routes/webhooks/whatsapp");

// ✅ WHATSAPP INTEGRATION CALLBACK (rota pública - redirecionamento OAuth)
const whatsappIntegrationPublicRoutes = require("./routes/integrationsWhatsAppPublic");
// ✅ META (Facebook/Instagram/Ads) OAuth callback
const metaIntegrationPublicRoutes = require("./routes/integrationsMetaPublic");
const ga4IntegrationPublicRoutes = require("./routes/integrationsGa4Public");

let publicRoutes;
try {
  publicRoutes = require("./routes/public");
} catch {
  try {
    publicRoutes = require("./routes/publicApprovals");
  } catch {
    publicRoutes = null;
    console.warn("⚠️ Rotas públicas não foram carregadas.");
  }
}

safeMount("/api/auth", authRoutes);
safeMount("/api/client-portal", clientPortalRoutes);
safeMount("/uploads/public", uploadsPublicRoutes);
if (publicRoutes) safeMount("/api/public", publicRoutes);

// ✅ Monta o webhook e o callback ANTES de proteger /api com auth/tenant/subscription
safeMount("/api/webhooks/whatsapp", whatsappWebhookRoutes);
safeMount("/api/integrations/whatsapp", whatsappIntegrationPublicRoutes);
safeMount("/api/integrations/meta", metaIntegrationPublicRoutes);
safeMount("/api/integrations/ga4", ga4IntegrationPublicRoutes);

// =========================
// Rotas internas (protegidas)
// Protegidas: auth → tenant → assinatura válida
// =========================
app.use("/api", authMiddleware, tenantMiddleware, checkSubscription);

// AuditLog (opcional)
const auditLogEnabled = process.env.AUDIT_LOG_ENABLED === "true";
if (auditLogEnabled) {
  const skip =
    process.env.AUDITLOG_SKIP_REGEX ||
    "^/health(z)?$|^/health$|^/api/auth";
  const bodyMax = Number(process.env.AUDITLOG_BODY_MAX || 2000);
  app.use("/api", auditLog({ skip, bodyMax }));
} else {
  console.log("📘 Audit Log desativado.");
}

// Rotas protegidas
safeMount("/api/tenants", require("./routes/tenants"));
safeMount("/api/clients", require("./routes/clients"));
safeMount("/api/posts", require("./routes/posts"));
safeMount("/api/tasks", require("./routes/tasks"));
safeMount("/api/competitors", require("./routes/competitors"));
safeMount("/api/finance", require("./routes/financialRecords"));
safeMount("/api/metrics", require("./routes/metrics"));
safeMount("/api/approvals", require("./routes/approvals"));
safeMount("/api/integrations", require("./routes/integrations"));
safeMount("/api/integrations/ga4", require("./routes/integrationsGa4"));
safeMount("/api/uploads", require("./routes/uploads"));
safeMount("/api/reports/dashboards", require("./routes/reportsDashboards"));
safeMount("/api/reports/templates", require("./routes/reportsTemplates"));
safeMount("/api/reports/connections", require("./routes/reportsConnections"));
safeMount("/api/reports/exports", require("./routes/reportsExports"));
safeMount("/api/reports", require("./routes/reports"));
safeMount("/api/reporting", require("./routes/reporting"));
safeMount("/api/analytics", require("./routes/analyticsDashboards"));
safeMount("/api/billing", require("./routes/billing"));
safeMount("/api/team", require("./routes/team"));
safeMount("/api/dashboard", require("./routes/dashboard"));
safeMount("/api/admin", require("./routes/admin"));
safeMount("/api/me", require("./routes/me"));
try {
  safeMount("/api/automation", require("./routes/automation"));
} catch {
  console.warn("ℹ️ Rotas de automation não carregadas.");
}

// 404 / Erros
app.use((req, res, next) => {
  if (res.headersSent) return next();
  return res.status(404).json({ error: "Rota não encontrada" });
});

app.use(errorLogger());

// Start
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
  console.log(`🩺 Healthcheck: http://localhost:${PORT}/healthz`);
});
