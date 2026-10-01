const mongoose = require('mongoose');

const adminSessionSchema = new mongoose.Schema(
  {
    tokenId: { type: String, required: true, unique: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminSession', adminSessionSchema);
