const asyncHandler = require('express-async-handler');
const Order = require('../Models/orderModel');

const makeRef = () => 'RAR-' + Date.now().toString(36).toUpperCase().slice(-6);

// POST /api/orders   (public — the main site's order drawer calls this)
const createOrder = asyncHandler(async (req, res) => {
  const { customer, items, total } = req.body;

  if (!customer?.name || !customer?.phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'customer name, phone and at least one item are required' });
  }

  const order = await Order.create({
    ref: makeRef(),
    customer,
    items,
    total: total ?? items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0),
  });

  res.status(201).json({ success: true, data: order });
});

// GET /api/orders   (admin only) — supports ?status=new to filter
const getOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const orders = await Order.find(filter).sort('-createdAt');
  res.status(200).json({ success: true, data: orders });
});

// GET /api/orders/:id   (admin only)
const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.status(200).json({ success: true, data: order });
});

// PUT /api/orders/:id   (admin only) — e.g. { status: "confirmed" }
const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true }
  );
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.status(200).json({ success: true, data: order });
});

// DELETE /api/orders/:id   (admin only)
const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  res.status(200).json({ success: true, message: 'Order deleted' });
});

module.exports = { createOrder, getOrders, getOrder, updateOrderStatus, deleteOrder };
