const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const asyncHandler = require('express-async-handler');
const Admin = require('../Models/adminModel');
const AdminSession = require('../Models/adminSessionModel');
const adminAuth = require('../Middlewares/adminAuth');
const validateMongoDBId = require('../Middlewares/validateMongoDBId');
const rateLimit = require('../Middlewares/rateLimit');
const { issuePasswordReset, revokeAdminSessions } = require('../Utils/passwordReset');

const router = express.Router();
const requireOwner = (req, res, next) => {
  if (req.admin.role !== 'owner') {
    return res.status(403).json({ message: 'Only the owner can manage admin accounts.' });
  }
  next();
};

router.use(adminAuth, requireOwner);

router.get('/', asyncHandler(async (_req, res) => {
  const admins = await Admin.find({ tenantId: _req.tenantId })
    .select('_id email role active createdAt')
    .sort('email');
  res.json({ success: true, data: admins });
}));

router.post('/', rateLimit({ scope: 'admin-create', windowMs: 60 * 60 * 1000, max: 5, includeEmail: true }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'A valid admin email address is required.' });
  }
  if (await Admin.exists({ email })) {
    return res.status(409).json({ message: 'An admin with that email already exists.' });
  }
  const temporaryPassword = crypto.randomBytes(48).toString('base64url');
  const admin = await Admin.create({
    email,
    tenantId: req.tenantId,
    passwordHash: await bcrypt.hash(temporaryPassword, 12),
    role: 'admin',
  });
  try {
    await issuePasswordReset(admin);
  } catch (error) {
    await AdminSession.deleteMany({ admin: admin._id });
    await admin.deleteOne();
    return res.status(error.status || 503).json({ message: 'The admin invitation email could not be sent.' });
  }
  res.status(201).json({
    success: true,
    data: { id: admin.id, email: admin.email, role: admin.role, active: admin.active },
  });
}));

router.patch('/:id', validateMongoDBId, asyncHandler(async (req, res) => {
  const admin = await Admin.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!admin) return res.status(404).json({ message: 'Admin not found.' });
  if (admin.role === 'owner') {
    return res.status(400).json({ message: 'The owner account cannot be changed through admin management.' });
  }

  if (req.body?.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'A valid admin email address is required.' });
    }
    const duplicate = await Admin.exists({ email, _id: { $ne: admin._id } });
    if (duplicate) return res.status(409).json({ message: 'An admin with that email already exists.' });
    admin.email = email;
  }
  if (req.body?.active !== undefined) {
    if (typeof req.body.active !== 'boolean') {
      return res.status(400).json({ message: 'active must be a boolean.' });
    }
    admin.active = req.body.active;
  }
  await admin.save();
  if (!admin.active) await revokeAdminSessions(admin._id);
  res.json({
    success: true,
    data: { id: admin.id, email: admin.email, role: admin.role, active: admin.active },
  });
}));

router.delete('/:id', validateMongoDBId, asyncHandler(async (req, res) => {
  const admin = await Admin.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!admin) return res.status(404).json({ message: 'Admin not found.' });
  if (admin.role === 'owner') {
    return res.status(400).json({ message: 'The owner account cannot be deleted.' });
  }
  await Promise.all([
    admin.deleteOne(),
    AdminSession.deleteMany({ admin: admin._id }),
  ]);
  res.json({ success: true, message: 'Admin deleted.' });
}));

router.post('/:id/reset-password', validateMongoDBId, rateLimit({ scope: 'admin-reset-otp', windowMs: 60 * 60 * 1000, max: 5 }), asyncHandler(async (req, res) => {
  const admin = await Admin.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!admin || !admin.active) return res.status(404).json({ message: 'Active admin not found.' });
  try {
    await issuePasswordReset(admin);
  } catch (error) {
    console.error('Admin-triggered password reset email failed:', error.message);
    return res.status(error.status || 503).json({ message: 'The password reset email could not be sent.' });
  }
  res.json({ success: true, message: 'Verification code sent.' });
}));

module.exports = router;
