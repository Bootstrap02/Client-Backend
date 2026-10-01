const crypto = require('crypto');
const express = require('express');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Admin = require('../Models/adminModel');
const AdminSession = require('../Models/adminSessionModel');
const Content = require('../Models/contentModel');
const Order = require('../Models/orderModel');
const Product = require('../Models/productModel');
const Tenant = require('../Models/tenantModel');
const rateLimit = require('../Middlewares/rateLimit');
const { issuePasswordReset } = require('../Utils/passwordReset');
const { sanitizePublicConfig } = require('../Utils/publicTenantConfig');
const { deleteImage } = require('../Utils/cloudinary');

const router = express.Router();

const platformAuth = (req, res, next) => {
  const expected = process.env.PLATFORM_ADMIN_API_KEY || '';
  const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (
    expectedBuffer.length < 32 ||
    expectedBuffer.length !== suppliedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return res.status(401).json({ message: 'Platform authorization is required.' });
  }
  next();
};

const normalizeDomains = (domains) => {
  if (!Array.isArray(domains) || domains.length === 0 || domains.length > 20) {
    throw new Error('Provide between 1 and 20 verified domains.');
  }
  return [...new Set(domains.map((domain) => {
    if (typeof domain !== 'string' || !domain.trim()) {
      throw new Error('Each domain must be a hostname.');
    }
    let url;
    try {
      url = new URL(`https://${domain.trim()}`);
    } catch {
      throw new Error('Each domain must be a valid hostname.');
    }
    if (url.hostname !== domain.trim().toLowerCase() || url.pathname !== '/') {
      throw new Error('Provide bare hostnames without a scheme, path, or port.');
    }
    return url.hostname;
  }))];
};

router.use(platformAuth);

router.get('/tenants', asyncHandler(async (_req, res) => {
  const tenants = await Tenant.find({})
    .select('_id key name domains active publicConfig createdAt')
    .sort('name');
  res.json({
    success: true,
    data: tenants.map((tenant) => ({
      id: tenant.id,
      key: tenant.key,
      name: tenant.name,
      domains: tenant.domains,
      active: tenant.active,
      publicConfig: sanitizePublicConfig(tenant.publicConfig || {}),
      createdAt: tenant.createdAt,
    })),
  });
}));

router.post(
  '/tenants',
  rateLimit({ scope: 'tenant-provision', windowMs: 60 * 60 * 1000, max: 5 }),
  asyncHandler(async (req, res) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const key = String(body.key || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase();
    if (
      !/^[a-z0-9][a-z0-9-]{0,62}$/.test(key) ||
      !name ||
      name.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(name)
    ) {
      return res.status(400).json({ message: 'A valid tenant key and name are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return res.status(400).json({ message: 'A valid owner email address is required.' });
    }
    let domains;
    try {
      domains = normalizeDomains(body.domains);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    const publicConfig = sanitizePublicConfig(body.publicConfig || {});
    if (await Tenant.exists({ $or: [{ key }, { domains: { $in: domains } }] })) {
      return res.status(409).json({ message: 'The tenant key or a domain is already registered.' });
    }

    let tenant;
    let owner;
    try {
      tenant = await Tenant.create({
        key,
        name,
        domains,
        publicConfig,
      });
      const temporaryPassword = crypto.randomBytes(48).toString('base64url');
      owner = await Admin.create({
        email: ownerEmail,
        tenantId: tenant._id,
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        role: 'owner',
      });
      await issuePasswordReset(owner);
    } catch (error) {
      if (owner) await owner.deleteOne();
      if (tenant) await tenant.deleteOne();
      if (error.code === 11000) {
        return res.status(409).json({ message: 'The tenant, domain, or owner email is already registered.' });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      data: { id: tenant.id, key: tenant.key, name: tenant.name, domains: tenant.domains, ownerEmail },
    });
  })
);

router.patch('/tenants/:key', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ key: req.params.key.toLowerCase() });
  if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
      return res.status(400).json({ message: 'A valid tenant name is required.' });
    }
    tenant.name = name;
  }
  if (req.body?.domains !== undefined) {
    try {
      tenant.domains = normalizeDomains(req.body.domains);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
  if (req.body?.active !== undefined) {
    if (typeof req.body.active !== 'boolean') {
      return res.status(400).json({ message: 'active must be a boolean.' });
    }
    tenant.active = req.body.active;
  }
  if (req.body?.publicConfig !== undefined) {
    tenant.publicConfig = sanitizePublicConfig({
      ...tenant.publicConfig,
      ...req.body.publicConfig,
    });
  }
  try {
    await tenant.save();
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A domain is already registered to another tenant.' });
    }
    throw error;
  }
  res.json({
    success: true,
    data: { id: tenant.id, key: tenant.key, name: tenant.name, domains: tenant.domains, active: tenant.active },
  });
}));

router.delete('/tenants/:key', asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOneAndUpdate(
    { key: req.params.key.toLowerCase() },
    { $set: { active: false } },
    { new: true }
  );
  if (!tenant) {
    return res.status(404).json({ message: 'Tenant not found.' });
  }

  const products = await Product.find({ tenantId: tenant._id }).select('images').lean();
  try {
    await Promise.all(
      products.flatMap((product) =>
        (product.images || [])
          .filter((image) => image.public_id)
          .map((image) => deleteImage(image.public_id, tenant))
      )
    );
  } catch (error) {
    console.error(`Tenant image cleanup failed for ${tenant.key}:`, error.message);
    return res.status(502).json({
      message: 'Tenant deactivated, but image cleanup failed. Retry deletion after resolving the storage error.',
    });
  }

  await mongoose.connection.transaction(async (session) => {
    const admins = await Admin.find({ tenantId: tenant._id }).select('_id').session(session);
    const adminIds = admins.map((admin) => admin._id);
    await Promise.all([
      Product.deleteMany({ tenantId: tenant._id }, { session }),
      Content.deleteMany({ tenantId: tenant._id }, { session }),
      Order.deleteMany({ tenantId: tenant._id }, { session }),
      AdminSession.deleteMany({ admin: { $in: adminIds } }, { session }),
      Admin.deleteMany({ tenantId: tenant._id }, { session }),
    ]);
    await tenant.deleteOne({ session });
  });

  res.json({ success: true, message: 'Tenant and its associated data were deleted.' });
}));

module.exports = router;
