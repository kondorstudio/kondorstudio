require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
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
// Honra X-Forwarded-* headers quando estamos atrás de proxies (Render / Nginx).
// Sem isso, req.protocol fica como "http" e os links de upload retornam URLs inseguras.
app.set("trust proxy", 1);
const isProduction = process.env.NODE_ENV === "production";

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
    console.warn("Não foi possível verificar colunas de refresh_tokens:", err?.message || err);
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
    console.warn("Não foi possível verificar colunas de users:", err?.message || err);
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
    console.warn("Não foi possível verificar colunas de clients:", err?.message || err);
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
    console.warn("Não foi possível verificar colunas de financial_records:", err?.message || err);
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
    console.warn("Não foi possível verificar colunas de team_members:", err?.message || err);
  }
}

ensureRefreshTokenColumns();
ensureUserColumns();
ensureClientOnboardingColumns();
ensureFinancialRecordColumns();
ensureTeamMemberColumns();

// Helpers
function safeMount(path, router) {
  if (router && typeof router === "function") {
    app.use(path, router);
  } else {
    console.warn(`⚠️ Rota "${path}" NÃO montada: export inválido.`);
  }
}

// Básico
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(helmet());
app.use(morgan(isProduction ? "combined" : "dev"));

// CORS
const devOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
];

let envOrigins = [];
if (process.env.CORS_ORIGIN) {
  envOrigins = process.env.CORS_ORIGIN.split(",").map((o) => o.trim());
}

const allowedOrigins = Array.from(new Set([...devOrigins, ...envOrigins]));

if (isProduction && envOrigins.length === 0) {
  console.error("⚠️  CORS_ORIGIN não definido. Configure no Render.");
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`🚫 CORS bloqueado para origem: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Static uploads (fallback local storage)
const localUploadsDir =
  process.env.LOCAL_UPLOADS_DIR ||
  path.join(__dirname, "../storage/uploads");
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

// Rotas públicas
const authRoutes = require("./routes/auth");
const clientPortalRoutes = require("./routes/clientPortal");
const uploadsPublicRoutes = require("./routes/uploadsPublic");

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

// === ROTAS INTERNAS ===
// Protegidas: auth → tenant → assinatura válida
app.use("/api", authMiddleware, tenantMiddleware, checkSubscription);

// AuditLog (opcional)
const auditLogEnabled = process.env.AUDIT_LOG_ENABLED === "true";
if (auditLogEnabled) {
  const skip = process.env.AUDITLOG_SKIP_REGEX || "^/health(z)?$|^/health$|^/api/auth";
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
safeMount("/api/finance", require("./routes/financialRecords"));
safeMount("/api/metrics", require("./routes/metrics"));
safeMount("/api/approvals", require("./routes/approvals"));
safeMount("/api/integrations", require("./routes/integrations"));
safeMount("/api/uploads", require("./routes/uploads"));
safeMount("/api/reports", require("./routes/reports"));
safeMount("/api/billing", require("./routes/billing"));
safeMount("/api/team", require("./routes/team"));
safeMount("/api/admin", require("./routes/admin"));
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
