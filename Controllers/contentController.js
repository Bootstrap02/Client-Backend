const asyncHandler = require('express-async-handler');
const Content = require('../Models/contentModel');
const { sanitizePublicContent } = require('../Utils/publicTenantConfig');

const ALLOWED_SECTIONS = ['header', 'home', 'about', 'footer'];

// GET /api/content/:section   e.g. /api/content/home
// Used by every page of the main site to pull its editable text.
const getContent = asyncHandler(async (req, res) => {
  const section = req.params.section.toLowerCase();
  const doc = await Content.findOne({ tenantId: req.tenantId, section });
  res.status(200).json({ success: true, data: doc ? sanitizePublicContent(doc.data) : {} });
});

// GET /api/content   — all sections at once, handy for the admin panel on load
const getAllContent = asyncHandler(async (req, res) => {
  const docs = await Content.find({ tenantId: req.tenantId });
  const bySection = {};
  docs.forEach((d) => { bySection[d.section] = sanitizePublicContent(d.data); });
  res.status(200).json({ success: true, data: bySection });
});

// PUT /api/content/:section   (admin only)
// Body is just the fields for that section, e.g. { heroTitle, heroSub, heroText }
// Creates the section document the first time, updates it after that.
const updateContent = asyncHandler(async (req, res) => {
  const section = req.params.section.toLowerCase();
  if (!ALLOWED_SECTIONS.includes(section)) {
    return res.status(400).json({ success: false, message: `Unknown section "${section}"` });
  }

  const doc = await Content.findOneAndUpdate(
    { tenantId: req.tenantId, section },
    { section, tenantId: req.tenantId, data: req.body || {} },
    { new: true, upsert: true }
  );

  res.status(200).json({ success: true, data: doc.data });
});

module.exports = { getContent, getAllContent, updateContent };
