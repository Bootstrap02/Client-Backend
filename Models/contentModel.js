const mongoose = require('mongoose');

// One document per page section (e.g. "header", "home", "about", "footer").
// "data" is intentionally flexible (Mixed) since each section has different
// fields, and the admin panel and site simply read/write whatever keys the
// front end forms use — no schema change needed to add a new text field.
const contentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    section: { type: String, required: true, lowercase: true, trim: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

contentSchema.index(
  { tenantId: 1, section: 1 },
  { unique: true, name: 'tenant_section_unique' }
);

module.exports = mongoose.model('Content', contentSchema);
