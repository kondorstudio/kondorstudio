const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function isConfigured() {
  return Boolean(STRIPE_SECRET_KEY);
}

async function stripeRequest(path, { method = 'GET', body } = {}) {
  if (!isConfigured()) {
    throw new Error('Stripe não configurado');
  }

  const url = `${STRIPE_API_BASE}${path}`;
  const headers = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const options = { method, headers };
  if (body) {
    const params = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      params.append(key, String(value));
    });
    options.body = params.toString();
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || 'Stripe error';
    throw new Error(msg);
  }
  return data;
}

async function listCustomerSubscriptions(customerId, { limit = 25 } = {}) {
  const qs = new URLSearchParams({ customer: customerId, limit: String(limit) });
  return stripeRequest(`/subscriptions?${qs.toString()}`, { method: 'GET' });
}

async function retrieveSubscription(subscriptionId) {
  return stripeRequest(`/subscriptions/${subscriptionId}`, { method: 'GET' });
}

async function cancelSubscription(subscriptionId, { cancelAtPeriodEnd = true } = {}) {
  return stripeRequest(`/subscriptions/${subscriptionId}`, {
    method: 'POST',
    body: { cancel_at_period_end: cancelAtPeriodEnd ? 'true' : 'false' },
  });
}

async function listCustomerInvoices(customerId, { limit = 25 } = {}) {
  const qs = new URLSearchParams({ customer: customerId, limit: String(limit) });
  return stripeRequest(`/invoices?${qs.toString()}`, { method: 'GET' });
}

async function retrieveCustomer(customerId) {
  return stripeRequest(`/customers/${customerId}`, { method: 'GET' });
}

module.exports = {
  isConfigured,
  listCustomerSubscriptions,
  retrieveSubscription,
  cancelSubscription,
  listCustomerInvoices,
  retrieveCustomer,
};
