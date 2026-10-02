const express = require('express');
const asyncHandler = require('express-async-handler');
const Content = require('../Models/contentModel');
const Product = require('../Models/productModel');
const { resolvePublicTenant } = require('../Middlewares/resolveTenant');
const { sanitizePublicConfig, sanitizePublicContent } = require('../Utils/publicTenantConfig');

const router = express.Router();

// GET /api/site  (public)
// One call the storefront makes when it loads: branding/contact config, every
// editable content section and the product catalogue for that client.
router.get('/', resolvePublicTenant, asyncHandler(async (req, res) => {
  const [docs, products] = await Promise.all([
    Content.find({ tenantId: req.tenantId }),
    Product.find({ tenantId: req.tenantId }).sort('-createdAt'),
  ]);
  const content = {};
  docs.forEach((doc) => { content[doc.section] = sanitizePublicContent(doc.data); });
  res.json({
    success: true,
    data: {
      config: {
        tenantKey: req.tenant.key,
        tenantName: req.tenant.name,
        ...sanitizePublicConfig(req.tenant.publicConfig || {}),
      },
      content,
      products,
    },
  });
}));

module.exports = router;
