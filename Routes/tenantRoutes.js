const express = require('express');
const asyncHandler = require('express-async-handler');
const adminAuth = require('../Middlewares/adminAuth');
const Tenant = require('../Models/tenantModel');
const { resolvePublicTenant } = require('../Middlewares/resolveTenant');
const { sanitizePublicConfig } = require('../Utils/publicTenantConfig');

const router = express.Router();

router.get('/config', resolvePublicTenant, (req, res) => {
  res.json({
    success: true,
    data: {
      tenantKey: req.tenant.key,
      tenantName: req.tenant.name,
      ...sanitizePublicConfig(req.tenant.publicConfig || {}),
    },
  });
});

router.get('/admin-config', adminAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      tenantKey: req.tenant.key,
      tenantName: req.tenant.name,
      ...sanitizePublicConfig(req.tenant.publicConfig || {}),
    },
  });
});

router.put('/admin-config', adminAuth, asyncHandler(async (req, res) => {
  const patch = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const publicConfig = sanitizePublicConfig({ ...req.tenant.publicConfig, ...patch });
  const tenant = await Tenant.findOneAndUpdate(
    { _id: req.tenantId },
    { $set: { publicConfig } },
    { new: true, runValidators: true }
  );
  res.json({
    success: true,
    data: {
      tenantKey: tenant.key,
      tenantName: tenant.name,
      ...sanitizePublicConfig(tenant.publicConfig),
    },
  });
}));

module.exports = router;
