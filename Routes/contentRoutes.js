const express = require('express');
const router = express.Router();

const { getContent, getAllContent, updateContent } = require('../Controllers/contentController');
const adminAuth = require('../Middlewares/adminAuth');
const { resolvePublicTenant } = require('../Middlewares/resolveTenant');

// Public — used by the main website to render each page
router.get('/', resolvePublicTenant, getAllContent);
router.get('/:section', resolvePublicTenant, getContent);

// Admin only — used by the admin panel's Header/Home/About/Footer forms
router.put('/:section', adminAuth, updateContent);

module.exports = router;
