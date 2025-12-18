const dayjs = require("dayjs");
const { prisma } = require("../prisma");

const CHECK_SUBSCRIPTION_ENABLED =
  (process.env.CHECK_SUBSCRIPTION_ENABLED || "true") === "true";

// Modo estrito: bloqueia acesso quando não há assinatura válida.
// Em modo não estrito, apenas injeta req.subscription e permite seguir.
const STRICT_SUBSCRIPTION_CHECK =
  process.env.ENFORCE_SUBSCRIPTION_CHECK === "true";

const ALWAYS_ALLOWED = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/client-login",
  "/api/tenants/register",
  "/api/billing/plans",
  "/api/billing/status",
  "/api/billing/subscribe",
  "/api/health",
  "/api/ready",
  "/api/healthz",
];

const PUBLIC_PREFIXES = ["/api/public"];

function isAlwaysAllowed(path) {
  return ALWAYS_ALLOWED.some((allowed) => path.startsWith(allowed));
}

function isPublicRoute(path) {
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function normalizeSubscriptionContext({ subscription, isTrial, trialEnds }) {
  if (!subscription) {
    return {
      status: isTrial ? "trial" : "missing",
      currentPeriodEnd: trialEnds ? trialEnds.toDate() : null,
      raw: null,
    };
  }

  const now = dayjs();
  const status = (subscription.status || "").toString().toUpperCase();
  const periodValid =
    !subscription?.currentPeriodEnd ||
    dayjs(subscription.currentPeriodEnd).isAfter(now);

  if (status === "SUCCEEDED" && periodValid) {
    return {
      status: "active",
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      raw: subscription,
    };
  }

  if (status === "PENDING" && periodValid) {
    return {
      status: "pending",
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      raw: subscription,
    };
  }

  return {
    status: "expired",
    currentPeriodEnd: subscription.currentPeriodEnd || null,
    raw: subscription,
  };
}

async function checkSubscription(req, res, next) {
  try {
    const path = req.originalUrl || req.path || "";

    // Rotas públicas
    if (isPublicRoute(path) || isAlwaysAllowed(path)) return next();

    if (!CHECK_SUBSCRIPTION_ENABLED) {
      req.subscription = { status: "disabled" };
      return next();
    }

    if (!req.tenantId) return next();

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (!tenant) {
      return res.status(401).json({
        error: "Tenant inválido",
        code: "TENANT_NOT_FOUND",
      });
    }

    // Trial de 3 dias baseado em createdAt
    const now = dayjs();
    const trialEnds = dayjs(tenant.createdAt).add(3, "day");

    const subscription = await prisma.subscription.findFirst({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: "desc" },
    });

    const isTrial = !subscription && now.isBefore(trialEnds);

    const ctx = normalizeSubscriptionContext({ subscription, isTrial, trialEnds });
    req.subscription = ctx;

    if (STRICT_SUBSCRIPTION_CHECK) {
      if (ctx.status === "missing") {
        return res.status(402).json({
          error: "Assinatura necessária para continuar.",
          code: "SUBSCRIPTION_REQUIRED",
        });
      }

      if (ctx.status === "expired") {
        return res.status(402).json({
          error: "Sua assinatura expirou.",
          code: "SUBSCRIPTION_EXPIRED",
        });
      }
    } else {
      if (ctx.status === "expired") {
        console.warn(
          "[CHECK_SUBSCRIPTION] assinatura expirada/inválida; liberando por modo flexível",
          subscription?.id,
        );
      }
    }

    return next();
  } catch (err) {
    console.error("[CHECK_SUBSCRIPTION_ERROR]", err);
    return next(); // fallback: libera para evitar travamentos
  }
}

module.exports = { checkSubscription };
