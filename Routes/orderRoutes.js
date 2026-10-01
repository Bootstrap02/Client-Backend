const express = require('express');
const router = express.Router();

const { createOrder, getOrders, getOrder, updateOrderStatus, deleteOrder } = require('../Controllers/orderController');
const adminAuth = require('../Middlewares/adminAuth');
const validateMongoDBId = require('../Middlewares/validateMongoDBId');
const { resolvePublicTenant } = require('../Middlewares/resolveTenant');
const rateLimit = require('../Middlewares/rateLimit');

// Public — the order drawer on the main site calls this when a customer sends an order
router.post(
  '/',
  resolvePublicTenant,
  rateLimit({ scope: 'public-order', windowMs: 15 * 60 * 1000, max: 10 }),
  createOrder
);

// Admin only — used by the admin panel to review and manage orders
router.get('/', adminAuth, getOrders);
router.get('/:id', adminAuth, validateMongoDBId, getOrder);
router.put('/:id', adminAuth, validateMongoDBId, updateOrderStatus);
router.delete('/:id', adminAuth, validateMongoDBId, deleteOrder);

module.exports = router;
