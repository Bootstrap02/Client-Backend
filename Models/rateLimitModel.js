const mongoose = require('mongoose');

const rateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    windowStartedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  }
);

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
