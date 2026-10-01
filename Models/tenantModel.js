const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    domains: [{ type: String, lowercase: true, trim: true }],
    active: { type: Boolean, default: true },
    publicConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

tenantSchema.index({ domains: 1 }, { unique: true, name: 'tenant_domain_unique' });

module.exports = mongoose.model('Tenant', tenantSchema);
