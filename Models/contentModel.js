const mongoose = require('mongoose');

// One document per page section (e.g. "header", "home", "about", "footer").
// "data" is intentionally flexible (Mixed) since each section has different
// fields, and the admin panel and site simply read/write whatever keys the
// front end forms use — no schema change needed to add a new text field.
const contentSchema = new mongoose.Schema(
  {
    section: { type: String, required: true, unique: true, lowercase: true, trim: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Content', contentSchema);
