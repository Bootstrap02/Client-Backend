const asyncHandler = require('express-async-handler');
const slugify = require('slugify');
const Product = require('../Models/productModel');
const { deleteImage } = require('../Utils/cloudinary');

// GET /api/products
// GET /api/products?category=sachet
// Used by the main website to list products (and filter by category tab).
const getProducts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;

  const products = await Product.find(filter).sort('-createdAt');
  res.status(200).json({ success: true, data: products });
});

// GET /api/products/:id
// Used by the product detail page.
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.status(200).json({ success: true, data: product });
});

// POST /api/products   (admin only, multipart/form-data with an "images" field)
const createProduct = asyncHandler(async (req, res) => {
  const { name, category, size, pack, price, description, inStock, featured } = req.body;

  if (!name || !category || !size || !pack || price === undefined) {
    return res.status(400).json({ success: false, message: 'name, category, size, pack and price are required' });
  }

  const product = await Product.create({
    name,
    slug: slugify(name, { lower: true }),
    category,
    size,
    pack,
    price,
    description,
    inStock: inStock === undefined ? true : inStock === 'true' || inStock === true,
    featured: featured === 'true' || featured === true,
    images: req.processedImages || [],
  });

  res.status(201).json({ success: true, data: product });
});

// PUT /api/products/:id   (admin only, multipart/form-data if replacing photos)
// Sending new images ADDS to the existing set; delete old ones first via
// DELETE /api/products/:id/images/:publicId if you want to replace them.
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const fields = ['name', 'category', 'size', 'pack', 'price', 'description', 'inStock', 'featured'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) product[f] = req.body[f];
  });
  if (req.body.name) product.slug = slugify(req.body.name, { lower: true });

  if (req.processedImages && req.processedImages.length > 0) {
    product.images.push(...req.processedImages);
  }

  await product.save();
  res.status(200).json({ success: true, data: product });
});

// DELETE /api/products/:id/images/:publicId   (admin only)
// Removes a single photo from a product, both in Cloudinary and in Mongo.
// public_id contains slashes (e.g. rarwater/products/abc123), so it is sent
// URL-encoded and decoded here.
const deleteProductImage = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  const publicId = decodeURIComponent(req.params.publicId);

  product.images = product.images.filter((img) => img.public_id !== publicId);
  await product.save();
  await deleteImage(publicId);

  res.status(200).json({ success: true, data: product });
});

// DELETE /api/products/:id   (admin only) — also removes its Cloudinary photos
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  await Promise.all((product.images || []).map((img) => deleteImage(img.public_id)));
  await product.deleteOne();

  res.status(200).json({ success: true, message: 'Product deleted' });
});

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProductImage,
  deleteProduct,
};
