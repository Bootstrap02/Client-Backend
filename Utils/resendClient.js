
const { getTenantEnv } = require('./tenantConfig');

// Email sender resolution:
//  1. If the tenant has its OWN Resend key + from address
//     (TENANT_<KEY>_RESEND_API_KEY / TENANT_<KEY>_RESEND_FROM_EMAIL), use those.
//  2. Otherwise use the platform owner's sender
//     (PLATFORM_RESEND_API_KEY / PLATFORM_RESEND_FROM_EMAIL).
// The key and from-address always come from the same source, so a tenant's
// address is never paired with the platform's key (or the other way round).
const getTenantEmailConfig = (tenant) => {
  const tenantKey = getTenantEnv(tenant, 'RESEND_API_KEY');
  const tenantFrom = getTenantEnv(tenant, 'RESEND_FROM_EMAIL');
  if (tenantKey && tenantFrom) return { apiKey: tenantKey, fromEmail: tenantFrom };
  return {
    apiKey: process.env.PLATFORM_RESEND_API_KEY,
    fromEmail: process.env.PLATFORM_RESEND_FROM_EMAIL,
  };
};

const sendTenantEmail = async (tenant, { to, subject, html, text }) => {
  const { apiKey, fromEmail } = getTenantEmailConfig(tenant);
  if (!apiKey || !fromEmail) {
    throw new Error(`Email is not configured for tenant "${tenant.key}".`);
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromEmail, to, subject, html, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(detail.message || `Email provider returned HTTP ${response.status}.`);
    error.status = 502;
    throw error;
  }
};

module.exports = { getTenantEmailConfig, sendTenantEmail };
