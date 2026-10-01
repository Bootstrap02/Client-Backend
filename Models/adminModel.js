const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['owner', 'admin'], default: 'admin', required: true },
    active: { type: Boolean, default: true },
    resetTokenHash: { type: String, select: false },
    resetExpiresAt: { type: Date, select: false },
    resetOtpHash: { type: String, select: false },
    resetOtpExpiresAt: { type: Date, select: false },
    resetOtpAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);
