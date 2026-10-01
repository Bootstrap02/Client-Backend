const crypto = require('crypto');
const AdminSession = require('../Models/adminSessionModel');
const { sendPasswordResetEmail } = require('./adminEmail');

const issuePasswordReset = async (admin) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Server authentication is not configured.');
  }
  const otp = String(crypto.randomInt(100000, 1000000));
  admin.resetOtpHash = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${admin.id}:${otp}`)
    .digest('hex');
  admin.resetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  admin.resetOtpAttempts = 0;
  admin.resetTokenHash = undefined;
  admin.resetExpiresAt = undefined;
  await admin.save();
  try {
    await sendPasswordResetEmail(admin, otp);
  } catch (error) {
    admin.resetOtpHash = undefined;
    admin.resetOtpExpiresAt = undefined;
    admin.resetOtpAttempts = 0;
    await admin.save();
    throw error;
  }
};

const revokeAdminSessions = (adminId) => AdminSession.deleteMany({ admin: adminId });

module.exports = { issuePasswordReset, revokeAdminSessions };
