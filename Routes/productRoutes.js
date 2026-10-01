const express = require('express');
const router = express.Router();

const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProductImage,
  deleteProduct,
} = require('../Controllers/productController');

const adminAuth = require('../Middlewares/adminAuth');
const { resolvePublicTenant } = require('../Middlewares/resolveTenant');
const validateMongoDBId = require('../Middlewares/validateMongoDBId');
const { uploadPhotos, resizeAndUpload } = require('../Middlewares/uploadImages');

// Public — used by the main website
router.get('/', resolvePublicTenant, getProducts);
router.get('/:id', resolvePublicTenant, validateMongoDBId, getProduct);

// Admin only — used by the admin panel
router.post('/', adminAuth, uploadPhotos.array('images', 6), resizeAndUpload, createProduct);
router.put('/:id', adminAuth, validateMongoDBId, uploadPhotos.array('images', 6), resizeAndUpload, updateProduct);
router.delete('/:id/images/:publicId', adminAuth, validateMongoDBId, deleteProductImage);
router.delete('/:id', adminAuth, validateMongoDBId, deleteProduct);

module.exports = router;
