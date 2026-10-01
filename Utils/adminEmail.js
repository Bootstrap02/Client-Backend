const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
const { sendTenantEmail } = require('./resendClient');

const sendPasswordResetEmail = async (admin, otp) => {
  const Tenant = require('../Models/tenantModel');
  const tenant = await Tenant.findById(admin.tenantId);
  if (!tenant) throw new Error('The admin tenant is not configured.');

  const safeName = escapeHtml(tenant.name);

  await sendTenantEmail(tenant, {
    to: [admin.email],
    subject: `Your ${tenant.name} admin verification code`,
    html: `<p>A password reset or account setup was requested for your ${safeName} admin account.</p><p>Your one-time verification code is <strong>${otp}</strong>.</p><p>The code expires in 10 minutes and can be used once. If you did not request it, you can ignore this email.</p>`,
    text: `Your ${tenant.name} admin verification code is ${otp}. It expires in 10 minutes and can be used once.`,
  });
};

module.exports = { sendPasswordResetEmail };
