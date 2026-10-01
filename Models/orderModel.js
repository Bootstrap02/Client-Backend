const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    pack: String,
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    ref: { type: String, required: true, unique: true }, // e.g. "RAR-ABC123"
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      mode: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },
      address: { type: String, default: '' },
      note: { type: String, default: '' },
    },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['new', 'confirmed', 'fulfilled', 'cancelled'],
      default: 'new',
    },
    notificationStatus: {
      email: { type: String, enum: ['sent', 'failed', 'not_configured'], default: 'not_configured' },
      whatsapp: { type: String, enum: ['sent', 'failed', 'not_configured'], default: 'not_configured' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
