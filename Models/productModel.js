const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, index: true },
    category: {
      type: String,
      required: true,
      enum: ['sachet', 'bottled', 'jug', 'dispenser'],
    },
    size: { type: String, required: true, trim: true }, // e.g. "75cl"
    pack: { type: String, required: true, trim: true }, // e.g. "Pack of 12 bottles"
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    images: [
      {
        secure_url: String,
        public_id: String,
      },
    ],
    inStock: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productSchema.index({ tenantId: 1, slug: 1 });

module.exports = mongoose.model('Product', productSchema);
