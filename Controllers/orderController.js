
const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const Order = require('../Models/orderModel');
const Product = require('../Models/productModel');
const { notifyOrder } = require('../Utils/orderNotifications');

const makeRef = () => `ORD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

// POST /api/orders   (public — the main site's order drawer calls this)
const createOrder = asyncHandler(async (req, res) => {
  const { customer, items } = req.body || {};

  if (
    typeof customer?.name !== 'string' ||
    !customer.name.trim() ||
    customer.name.length > 120 ||
    typeof customer.phone !== 'string' ||
    !/^[+0-9() .-]{7,25}$/.test(customer.phone.trim()) ||
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 25
  ) {
    return res.status(400).json({ success: false, message: 'customer name, phone and at least one item are required' });
  }

  const email = typeof customer.email === 'string' ? customer.email.trim() : '';
  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return res.status(400).json({ success: false, message: 'The email address is not valid.' });
  }
  const mode = customer.mode === 'pickup' ? 'pickup' : 'delivery';
  const address = typeof customer.address === 'string' ? customer.address.trim() : '';
  const note = typeof customer.note === 'string' ? customer.note.trim() : '';
  if (mode === 'delivery' && !address) {
    return res.status(400).json({ success: false, message: 'A delivery address is required.' });
  }
  if (address.length > 500 || note.length > 1000) {
    return res.status(400).json({ success: false, message: 'Order details exceed the allowed length.' });
  }

  const quantities = new Map();
  for (const item of items) {
    const productId = String(item?.productId || '');
    const quantity = Number(item?.qty);
    if (!/^[a-f\d]{24}$/i.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return res.status(400).json({ success: false, message: 'Each order item must have a valid product and quantity.' });
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  if ([...quantities.values()].some((quantity) => quantity > 999)) {
    return res.status(400).json({ success: false, message: 'The requested quantity is too large.' });
  }

  const products = await Product.find({
    _id: { $in: [...quantities.keys()] },
    tenantId: req.tenantId,
    inStock: true,
  });
  if (products.length !== quantities.size) {
    return res.status(400).json({ success: false, message: 'One or more products are unavailable.' });
  }

  const orderItems = products.map((product) => ({
    productId: product._id,
    name: product.name,
    pack: product.pack,
    qty: quantities.get(String(product._id)),
    unitPrice: product.price,
  }));
  const total = orderItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const order = await Order.create({
    tenantId: req.tenantId,
    ref: makeRef(),
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email,
      mode,
      address,
      note,
    },
    items: orderItems,
    total,
  });
  order.notificationStatus = await notifyOrder(req.tenant, order);
  await order.save();

  res.status(201).json({ success: true, data: order });
});

// GET /api/orders   (admin only) — supports ?status=new to filter
const getOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const orders = await Order.find({ ...filter, tenantId: req.tenantId }).sort('-createdAt');
  res.status(200).json({ success: true, data: orders });
});

// GET /api/orders/:id   (admin only)
const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.status(200).json({ success: true, data: order });
});

// PUT /api/orders/:id   (admin only) — e.g. { status: "confirmed" }
const updateOrderStatus = asyncHandler(async (req, res) => {
  const allowedStatuses = ['new', 'confirmed', 'fulfilled', 'cancelled'];
  if (!allowedStatuses.includes(req.body?.status)) {
    return res.status(400).json({ success: false, message: 'A valid order status is required.' });
  }
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { status: req.body.status },
    { new: true, runValidators: true }
  );
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.status(200).json({ success: true, data: order });
});

// DELETE /api/orders/:id   (admin only)
const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.status(200).json({ success: true, message: 'Order deleted' });
});

module.exports = { createOrder, getOrders, getOrder, updateOrderStatus, deleteOrder };
