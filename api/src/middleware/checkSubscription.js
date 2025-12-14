const dayjs = require("dayjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ALWAYS_ALLOWED = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/tenants/register",
  "/api/billing/plans",
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

async function checkSubscription(req, res, next) {
  try {
    const path = req.originalUrl || req.path || "";

    // Rotas públicas
    if (isPublicRoute(path) || isAlwaysAllowed(path)) return next();

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

    if (!subscription && !isTrial) {
      return res.status(402).json({
        error: "Assinatura necessária para continuar.",
        code: "SUBSCRIPTION_REQUIRED",
      });
    }

    // PaymentStatus enum values in Prisma (uppercase) + optional lowercase fallbacks
    const validStatuses = ["PENDING", "SUCCEEDED", "TRIAL", "ACTIVE"];
    const subscriptionStatus = (
      typeof subscription?.status === "string"
        ? subscription.status
        : ""
    ).toUpperCase();
    const periodValid =
      !subscription?.currentPeriodEnd ||
      dayjs(subscription.currentPeriodEnd).isAfter(now);

    const subValid =
      subscription &&
      validStatuses.includes(subscriptionStatus) &&
      periodValid;

    if (subscription && !subValid) {
      return res.status(402).json({
        error: "Sua assinatura expirou.",
        code: "SUBSCRIPTION_EXPIRED",
      });
    }

    req.subscription = subscription || {
      status: "trial",
      currentPeriodEnd: trialEnds.toDate(),
    };

    return next();
  } catch (err) {
    console.error("[CHECK_SUBSCRIPTION_ERROR]", err);
    return next(); // fallback: libera para evitar travamentos
  }
}

module.exports = { checkSubscription };
