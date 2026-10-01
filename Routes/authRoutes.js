const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const Admin = require('../Models/adminModel');
const AdminSession = require('../Models/adminSessionModel');
const Tenant = require('../Models/tenantModel');
const adminAuth = require('../Middlewares/adminAuth');
const rateLimit = require('../Middlewares/rateLimit');
const { issuePasswordReset, revokeAdminSessions } = require('../Utils/passwordReset');

const router = express.Router();
const isValidEmail = (value) =>
  typeof value === 'string' &&
  value.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const COOKIE_NAME = 'rar_admin_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: SESSION_MS,
  path: '/',
});

router.post('/login', rateLimit({ scope: 'admin-login', windowMs: 15 * 60 * 1000, max: 10, includeEmail: true }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!isValidEmail(email) || !password || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ message: 'A valid email and password are required.' });
  }
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  if (!admin || !admin.active || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  const tenant = await Tenant.findOne({ _id: admin.tenantId, active: true });
  if (!tenant) return res.status(401).json({ message: 'Email or password is incorrect.' });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({ message: 'Server authentication is not configured.' });
  }

  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_MS);
  const token = jwt.sign(
    { sub: admin.id, jti: tokenId, tenantId: String(tenant._id) },
    process.env.JWT_SECRET,
    { expiresIn: '8h', issuer: 'rar-water-api', audience: 'rar-water-admin' }
  );
  await AdminSession.create({ tokenId, admin: admin._id, expiresAt });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({
    success: true,
    data: { id: admin.id, email: admin.email, role: admin.role, tenant: tenant.name },
  });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token && process.env.JWT_SECRET) {
    try {
      const claims = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'rar-water-api',
        audience: 'rar-water-admin',
      });
      await AdminSession.deleteOne({ tokenId: claims.jti, admin: claims.sub });
    } catch (error) {
      if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') throw error;
    }
  }
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ success: true });
}));

router.get('/me', adminAuth, (req, res) => {
  res.json({
    success: true,
    data: { id: req.admin.id, email: req.admin.email, role: req.admin.role, tenant: req.tenant.name },
  });
});

router.post('/forgot-password', rateLimit({ scope: 'admin-forgot', windowMs: 60 * 60 * 1000, max: 5, includeEmail: true }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }
  const admin = await Admin.findOne({ email, active: true });
  if (admin) {
    try {
      await issuePasswordReset(admin);
    } catch (error) {
      console.error('Password reset email failed:', error.message);
    }
  }
  res.status(202).json({
    success: true,
    message: 'If an active account exists for that email, a verification code has been sent.',
  });
}));

router.post('/verify-otp', rateLimit({ scope: 'admin-verify-otp', windowMs: 15 * 60 * 1000, max: 8, includeEmail: true }), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const otp = String(req.body?.otp || '').trim();
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'The verification code is invalid or expired.' });
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({ message: 'Server authentication is not configured.' });
  }
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: 'The verification code is invalid or expired.' });
  }

  const admin = await Admin.findOne({ email, active: true })
    .select('+resetOtpHash +resetOtpExpiresAt +resetOtpAttempts');
  if (!admin?.resetOtpHash || !admin.resetOtpExpiresAt || admin.resetOtpExpiresAt <= new Date()) {
    return res.status(400).json({ message: 'The verification code is invalid or expired.' });
  }

  const candidateHash = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${admin.id}:${otp}`)
    .digest('hex');
  const expected = Buffer.from(admin.resetOtpHash, 'hex');
  const candidate = Buffer.from(candidateHash, 'hex');
  if (expected.length !== candidate.length || !crypto.timingSafeEqual(expected, candidate)) {
    const attempts = (admin.resetOtpAttempts || 0) + 1;
    const update = attempts >= 5
      ? { $unset: { resetOtpHash: 1, resetOtpExpiresAt: 1 }, $set: { resetOtpAttempts: 0 } }
      : { $set: { resetOtpAttempts: attempts } };
    await Admin.updateOne({ _id: admin._id, resetOtpHash: admin.resetOtpHash }, update);
    return res.status(400).json({ message: 'The verification code is invalid or expired.' });
  }

  const resetToken = crypto.randomBytes(32).toString('base64url');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const result = await Admin.updateOne(
    {
      _id: admin._id,
      resetOtpHash: admin.resetOtpHash,
      resetOtpExpiresAt: { $gt: new Date() },
      resetOtpAttempts: { $lt: 5 },
    },
    {
      $set: { resetTokenHash, resetExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      $unset: { resetOtpHash: 1, resetOtpExpiresAt: 1 },
    }
  );
  if (result.modifiedCount !== 1) {
    return res.status(400).json({ message: 'The verification code is invalid or expired.' });
  }
  res.json({ success: true, data: { resetToken } });
}));

router.post('/reset-password', rateLimit({ scope: 'admin-reset-password', windowMs: 15 * 60 * 1000, max: 10 }), asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (password.length < 12 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ message: 'Password must be 12 to 72 bytes long.' });
  }
  if (!token) return res.status(400).json({ message: 'The reset verification is invalid or expired.' });

  const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await Admin.findOneAndUpdate({
    resetTokenHash,
    resetExpiresAt: { $gt: new Date() },
    active: true,
  }, {
    $set: { passwordHash, resetOtpAttempts: 0 },
    $unset: {
      resetTokenHash: 1,
      resetExpiresAt: 1,
      resetOtpHash: 1,
      resetOtpExpiresAt: 1,
    },
  }, { new: true }).select('_id');
  if (!admin) {
    return res.status(400).json({ message: 'The reset verification is invalid or expired.' });
  }
  await revokeAdminSessions(admin._id);
  res.json({ success: true, message: 'Password updated. Please sign in.' });
}));

module.exports = router;
