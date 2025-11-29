/**
 * KONDOR STUDIO — SERVER.JS (FASE 5 FINAL)
 * API Express + Prisma + Multi-tenant + AuditLog + CheckSubscription
 */

require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { prisma } = require("./prisma");

const authMiddleware = require("./middleware/auth");
const tenantMiddleware = require("./middleware/tenant");
const auditLog = require("./middleware/auditLog");
const checkSubscription = require("./middleware/checkSubscription");

/* ============================================
   APP / MIDDLEWARES BÁSICOS
============================================ */

const app = express();
const isProduction = process.env.NODE_ENV === "production";

// Body parsers
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

// Segurança básica
app.use(helmet());

// Logs HTTP
app.use(morgan(isProduction ? "combined" : "dev"));

/* ============================================
   CORS HARDENING
============================================ */

const devOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173"
];

let envOrigins = [];
if (process.env.CORS_ORIGIN) {
  envOrigins = process.env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

const allowedOrigins = Array.from(new Set([...devOrigins, ...envOrigins]));

if (isProduction && envOrigins.length === 0) {
  console.error(
    "⚠️  CORS_ORIGIN não definido em produção. Configure domínios do painel/portal para evitar bloqueios."
  );
}

const corsOptions = {
  origin(origin, callback) {
    // Requisições sem origem (ex: curl, healthchecks) são permitidas
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`🚫 CORS bloqueado para origem: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
};

app.use(cors(corsOptions));

/* ============================================
   HEALTHCHECKS
============================================ */

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/healthz", async (req, res) => {
  try {
    // Verifica conexão com o banco
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ status: "ok", db: "ok" });
  } catch (err) {
    console.error("❌ Healthcheck /healthz falhou:", err);
    return res.status(500).json({ status: "error", db: "error" });
  }
});

/* ============================================
   ROTAS PÚBLICAS
============================================ */

// Auth (login, refresh, etc.)
const authRoutes = require("./routes/auth");
// Aprovações públicas / links externos
let publicRoutes;
try {
  // Ajuste aqui se o nome do arquivo for diferente (ex: publicApprovals)
  publicRoutes = require("./routes/public");
} catch (e) {
  // Fallback se você estiver usando outro nome de arquivo
  try {
    publicRoutes = require("./routes/publicApprovals");
  } catch (err) {
    publicRoutes = null;
    console.warn(
      "⚠️ Rotas públicas não foram carregadas. Verifique ./routes/public ou ./routes/publicApprovals."
    );
  }
}

app.use("/api/auth", authRoutes);

if (publicRoutes) {
  app.use("/api/public", publicRoutes);
}

/* ============================================
   ROTAS AUTENTICADAS / MULTI-TENANT
============================================ */

// A partir daqui, tudo em /api/* exige auth + tenant
app.use("/api", authMiddleware, tenantMiddleware);

/* ============================================
   AUDIT LOG (FASE 5)
============================================ */

const auditLogEnabled = process.env.AUDIT_LOG_ENABLED === "true";

if (auditLogEnabled) {
  const skip = process.env.AUDITLOG_SKIP_REGEX
    ? process.env.AUDITLOG_SKIP_REGEX
    : "^/health(z)?$|^/health$|^/api/auth";
  const bodyMax = Number(process.env.AUDITLOG_BODY_MAX || 2000);

  console.log("📝 Audit Log ATIVADO", { skip, bodyMax });

  // Importante: usamos os nomes corretos esperados pelo middleware (skip, bodyMax)
  app.use(
    "/api",
    auditLog({
      skip,
      bodyMax
    })
  );
} else {
  console.log("📘 Audit Log DESATIVADO (AUDIT_LOG_ENABLED != 'true')");
}

/* ============================================
   CHECK SUBSCRIPTION (FASE 5)
============================================ */

const subscriptionEnabled =
  process.env.CHECK_SUBSCRIPTION_ENABLED !== "false";

function applySubscriptionGuard(router) {
  // Se desabilitado via env, devolve o router original sem alterações
  if (!subscriptionEnabled) {
    return router;
  }

  const guarded = express.Router();
  guarded.use(checkSubscription);
  guarded.use(router);
  return guarded;
}

/* ============================================
   ROTAS DE NEGÓCIO (PROTEGIDAS)
============================================ */

const tenantsRoutes = require("./routes/tenants");
const clientsRoutes = require("./routes/clients");
const postsRoutes = require("./routes/posts");
const tasksRoutes = require("./routes/tasks");
const metricsRoutes = require("./routes/metrics");
const approvalsRoutes = require("./routes/approvals");
const integrationsRoutes = require("./routes/integrations");
const reportsRoutes = require("./routes/reports");
const billingRoutes = require("./routes/billing");
const teamRoutes = require("./routes/team");
let automationRoutes = null;

try {
  automationRoutes = require("./routes/automation");
} catch (err) {
  console.warn(
    "ℹ️ Rotas de automation (WhatsApp / automações) não foram carregadas. Verifique ./routes/automation se necessário."
  );
}

app.use("/api/tenants", applySubscriptionGuard(tenantsRoutes));
app.use("/api/clients", applySubscriptionGuard(clientsRoutes));
app.use("/api/posts", applySubscriptionGuard(postsRoutes));
app.use("/api/tasks", applySubscriptionGuard(tasksRoutes));
app.use("/api/metrics", applySubscriptionGuard(metricsRoutes));
app.use("/api/approvals", applySubscriptionGuard(approvalsRoutes));
app.use("/api/integrations", applySubscriptionGuard(integrationsRoutes));
app.use("/api/reports", applySubscriptionGuard(reportsRoutes));
app.use("/api/billing", applySubscriptionGuard(billingRoutes));
app.use("/api/team", applySubscriptionGuard(teamRoutes));

if (automationRoutes) {
  app.use("/api/automation", applySubscriptionGuard(automationRoutes));
}

/* ============================================
   404 / ERRO GENÉRICO
============================================ */

app.use((req, res, next) => {
  if (res.headersSent) return next();
  return res.status(404).json({ error: "Rota não encontrada" });
});

app.use((err, req, res, next) => {
  console.error("❌ Erro não tratado:", err && err.stack ? err.stack : err);

  if (res.headersSent) {
    return next(err);
  }

  return res
    .status(err.status || 500)
    .json({ error: err.message || "Erro interno do servidor" });
});

/* ============================================
   START
============================================ */

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
  console.log(`🩺 Healthcheck: http://localhost:${PORT}/healthz`);
});
