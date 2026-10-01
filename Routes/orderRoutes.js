const express = require('express');
const router = express.Router();

const { createOrder, getOrders, getOrder, updateOrderStatus, deleteOrder } = require('../Controllers/orderController');
const adminAuth = require('../Middlewares/adminAuth');
const validateMongoDBId = require('../Middlewares/validateMongoDBId');

// Public — the order drawer on the main site calls this when a customer sends an order
router.post('/', createOrder);

// Admin only — used by the admin panel to review and manage orders
router.get('/', adminAuth, getOrders);
router.get('/:id', adminAuth, validateMongoDBId, getOrder);
router.put('/:id', adminAuth, validateMongoDBId, updateOrderStatus);
router.delete('/:id', adminAuth, validateMongoDBId, deleteOrder);

module.exports = router;
