const { getTenantEnv } = require('./tenantConfig');

const getTenantEmailConfig = (tenant) => ({
  apiKey: getTenantEnv(tenant, 'RESEND_API_KEY'),
  fromEmail: getTenantEnv(tenant, 'RESEND_FROM_EMAIL'),
});

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
