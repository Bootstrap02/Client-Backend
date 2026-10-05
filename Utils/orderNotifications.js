
const { getTenantEmailConfig, sendTenantEmail } = require('./resendClient');
const { getTenantEnv } = require('./tenantConfig');

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

const orderText = (order) => [
  `Order ${order.ref}`,
  `Customer: ${order.customer.name}`,
  `Phone: ${order.customer.phone}`,
  order.customer.email ? `Email: ${order.customer.email}` : '',
  order.customer.mode === 'pickup' ? 'Pickup' : `Delivery address: ${order.customer.address}`,
  ...order.items.map((item) => `${item.qty} x ${item.name} (${item.pack}) - NGN ${item.unitPrice * item.qty}`),
  `Total: NGN ${order.total}`,
  order.customer.note ? `Note: ${order.customer.note}` : '',
].filter(Boolean).join('\n');

const sendEmail = async (tenant, order) => {
  const { apiKey, fromEmail } = getTenantEmailConfig(tenant);
  // Order alerts go to: a tenant-specific env override, else the email saved on
  // the tenant's site settings, else (default tenant only) the platform owner.
  const configEmail = typeof tenant.publicConfig?.email === 'string' ? tenant.publicConfig.email.trim() : '';
  const toEmail = getTenantEnv(tenant, 'ORDER_NOTIFICATION_EMAIL')
    || configEmail
    || (tenant.key === (process.env.DEFAULT_TENANT_KEY || 'rosita-waters') ? process.env.OWNER_EMAIL : undefined);
  if (!apiKey || !fromEmail || !toEmail) return 'not_configured';

  const items = order.items.map((item) =>
    `<li>${item.qty} x ${escapeHtml(item.name)} (${escapeHtml(item.pack)}) — NGN ${item.unitPrice * item.qty}</li>`
  ).join('');
  const customer = order.customer;
  await sendTenantEmail(tenant, {
    to: [toEmail],
    subject: `${tenant.name} order ${order.ref}`,
    html: `<h2>New order ${escapeHtml(order.ref)}</h2><p>${escapeHtml(customer.name)} — ${escapeHtml(customer.phone)}${customer.email ? ` — ${escapeHtml(customer.email)}` : ''}</p><p>${customer.mode === 'pickup' ? 'Pickup' : `Delivery: ${escapeHtml(customer.address)}`}</p><ul>${items}</ul><p>Total: NGN ${order.total}</p><p>${escapeHtml(customer.note || '')}</p>`,
    text: orderText(order),
  });
  return 'sent';
};

const sendWhatsApp = async (tenant, order) => {
  const accessToken = getTenantEnv(tenant, 'WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = getTenantEnv(tenant, 'WHATSAPP_PHONE_NUMBER_ID');
  const recipient = getTenantEnv(tenant, 'WHATSAPP_ORDER_RECIPIENT')
    || (typeof tenant.publicConfig?.whatsapp === 'string' ? tenant.publicConfig.whatsapp.replace(/\D/g, '') : '');
  if (!accessToken || !phoneNumberId || !recipient) return 'not_configured';

  const version = getTenantEnv(tenant, 'WHATSAPP_API_VERSION') || 'v20.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: { body: orderText(order) },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`WhatsApp provider returned HTTP ${response.status}.`);
  return 'sent';
};

const notifyOrder = async (tenant, order) => {
  const results = await Promise.allSettled([
    sendEmail(tenant, order),
    sendWhatsApp(tenant, order),
  ]);
  const statuses = {};
  for (const [index, channel] of ['email', 'whatsapp'].entries()) {
    const result = results[index];
    if (result.status === 'fulfilled') {
      statuses[channel] = result.value;
    } else {
      statuses[channel] = 'failed';
      console.error(`${channel} order notification failed for ${tenant.key}/${order.ref}:`, result.reason.message);
    }
  }
  return statuses;
};

module.exports = { notifyOrder };
