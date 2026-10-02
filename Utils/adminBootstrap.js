const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Admin = require('../Models/adminModel');
const Content = require('../Models/contentModel');
const Order = require('../Models/orderModel');
const Product = require('../Models/productModel');
const Tenant = require('../Models/tenantModel');

const configuredDomains = () => {
  const values = (process.env.DEFAULT_TENANT_DOMAINS
    || 'rositawaters.com,www.rositawaters.com,rosita-waters-react.vercel.app,rosita-waters.vercel.app')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production') {
    values.push('localhost', '127.0.0.1');
  }
  return [...new Set(values.map((value) => {
    try {
      return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
    } catch {
      throw new Error(`Invalid domain in DEFAULT_TENANT_DOMAINS: ${value}`);
    }
  }))];
};

const ensureDefaultTenant = async () => {
  const key = (process.env.DEFAULT_TENANT_KEY || 'rosita-waters').trim().toLowerCase();
  const name = (process.env.DEFAULT_TENANT_NAME || 'Rosita Waters').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
    throw new Error('DEFAULT_TENANT_KEY must be a lowercase slug.');
  }
  if (!name) throw new Error('DEFAULT_TENANT_NAME must not be empty.');

  const tenant = await Tenant.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, name, active: true }, $addToSet: { domains: { $each: configuredDomains() } } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  // Dummy contact details so a brand-new site works end to end. The owner can
  // replace all of these from the admin panel's Website settings.
  await Tenant.updateOne(
    { _id: tenant._id, 'publicConfig.whatsapp': { $exists: false } },
    {
      $set: {
        'publicConfig.whatsapp': process.env.DEFAULT_WHATSAPP_NUMBER || '2348000000000',
        'publicConfig.phones': ['08000000000'],
        'publicConfig.brand': name,
        'publicConfig.company': name,
        'publicConfig.currency': '\u20A6',
        'publicConfig.showPrices': true,
      },
    }
  );
  return tenant;
};

const migrateLegacyTenantData = async (tenant) => {
  const tenantCount = await Tenant.countDocuments();
  if (tenantCount !== 1) return;

  const missingTenant = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
  await Promise.all([
    Product.updateMany(missingTenant, { $set: { tenantId: tenant._id } }),
    Order.updateMany(missingTenant, { $set: { tenantId: tenant._id } }),
    Content.updateMany(missingTenant, { $set: { tenantId: tenant._id } }),
    Admin.updateMany(missingTenant, { $set: { tenantId: tenant._id } }),
  ]);

  await Content.collection.createIndex(
    { tenantId: 1, section: 1 },
    { unique: true, name: 'tenant_section_unique' }
  );
  const indexes = await Content.collection.indexes();
  if (indexes.some((index) => index.name === 'section_1' && index.unique)) {
    await Content.collection.dropIndex('section_1');
  }
};

const validateOwnerBootstrapConfig = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters before starting the API');
  }
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('OWNER_EMAIL must be configured before starting the API');
  return email;
};

const ensureOwnerAccount = async () => {
  const email = validateOwnerBootstrapConfig();
  const tenant = await ensureDefaultTenant();
  await migrateLegacyTenantData(tenant);
  await Admin.updateMany(
    { tenantId: tenant._id, role: 'owner', email: { $ne: email } },
    { $set: { role: 'admin' } }
  );
  const existing = await Admin.findOne({ email });
  if (existing) {
    if (String(existing.tenantId) !== String(tenant._id)) {
      throw new Error('OWNER_EMAIL is already assigned to a different tenant.');
    }
    if (existing.role !== 'owner') await Admin.updateOne({ _id: existing._id }, { $set: { role: 'owner' } });
    return;
  }

  const randomPassword = crypto.randomBytes(48).toString('base64url');
  const passwordHash = await bcrypt.hash(randomPassword, 12);
  await Admin.create({ email, tenantId: tenant._id, passwordHash, role: 'owner' });
  console.log(`Initialized owner account for ${email}; use password reset to set its password.`);
};

module.exports = {
  ensureOwnerAccount,
  ensureDefaultTenant,
  migrateLegacyTenantData,
  validateOwnerBootstrapConfig,
};
