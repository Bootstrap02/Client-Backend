const express = require('express');
const asyncHandler = require('express-async-handler');
const adminAuth = require('../Middlewares/adminAuth');
const Tenant = require('../Models/tenantModel');
const { resolvePublicTenant } = require('../Middlewares/resolveTenant');
const { sanitizePublicConfig, IMAGE_FIELDS } = require('../Utils/publicTenantConfig');
const { uploadPhotos, resizeAndUpload } = require('../Middlewares/uploadImages');

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

// POST /api/tenant/admin-config/images/:key   (multipart, field "images")
// Uploads a site image (logo, homeHero, factory, family, flyer, sachet, bottled,
// jug, dispenser) to Cloudinary and stores its URL in the tenant's public config.
router.post(
  '/admin-config/images/:key',
  adminAuth,
  (req, res, next) => {
    if (!IMAGE_FIELDS.includes(req.params.key)) {
      return res.status(400).json({ message: `Unknown image slot "${req.params.key}".` });
    }
    req.uploadFolder = 'site';
    req.keepPng = req.params.key === 'logo';
    next();
  },
  uploadPhotos.array('images', 1),
  resizeAndUpload,
  asyncHandler(async (req, res) => {
    const uploaded = req.processedImages?.[0];
    if (!uploaded) return res.status(400).json({ message: 'Choose an image file to upload.' });
    const existing = req.tenant.publicConfig || {};
    const publicConfig = sanitizePublicConfig({
      ...existing,
      images: { ...(existing.images || {}), [req.params.key]: uploaded.secure_url },
    });
    const tenant = await Tenant.findOneAndUpdate(
      { _id: req.tenantId },
      { $set: { publicConfig } },
      { new: true }
    );
    res.json({
      success: true,
      data: {
        tenantKey: tenant.key,
        tenantName: tenant.name,
        ...sanitizePublicConfig(tenant.publicConfig),
      },
    });
  })
);

module.exports = router;
