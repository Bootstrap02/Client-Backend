const asyncHandler = require('express-async-handler');
const slugify = require('slugify');
const Product = require('../Models/productModel');
const { deleteImage } = require('../Utils/cloudinary');

const PRODUCT_CATEGORIES = ['sachet', 'bottled', 'jug', 'dispenser'];
const MAX_DESCRIPTION_LENGTH = 5000;

const normalizeBoolean = (value, field) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return `${field} must be a boolean.`;
};

const validateProductInput = (body, { create = false } = {}) => {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const fields = ['name', 'category', 'size', 'pack', 'price', 'description', 'inStock', 'featured'];
  const result = {};

  if (create && fields.slice(0, 5).some((field) => input[field] === undefined || input[field] === '')) {
    return { error: 'name, category, size, pack and price are required.' };
  }
  for (const field of ['name', 'size', 'pack']) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].trim().length > 200) {
      return { error: `${field} must be a non-empty string of at most 200 characters.` };
    }
    result[field] = input[field].trim();
  }
  if (input.category !== undefined) {
    if (!PRODUCT_CATEGORIES.includes(input.category)) {
      return { error: `category must be one of: ${PRODUCT_CATEGORIES.join(', ')}.` };
    }
    result.category = input.category;
  }
  if (input.price !== undefined) {
    if (input.price === '' || (typeof input.price !== 'number' && typeof input.price !== 'string')) {
      return { error: 'price must be a non-negative number.' };
    }
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) return { error: 'price must be a non-negative number.' };
    result.price = price;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > MAX_DESCRIPTION_LENGTH) {
      return { error: `description must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters.` };
    }
    result.description = input.description;
  }
  for (const field of ['inStock', 'featured']) {
    if (input[field] === undefined) continue;
    const value = normalizeBoolean(input[field], field);
    if (typeof value !== 'boolean') return { error: value };
    result[field] = value;
  }
  return { data: result };
};

// GET /api/products
// GET /api/products?category=sachet
// Used by the main website to list products (and filter by category tab).
const getProducts = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (req.query.category) {
    if (typeof req.query.category !== 'string' || !PRODUCT_CATEGORIES.includes(req.query.category)) {
      return res.status(400).json({ success: false, message: 'A valid product category is required.' });
    }
    filter.category = req.query.category;
  }

  const products = await Product.find(filter).sort('-createdAt');
  res.status(200).json({ success: true, data: products });
});

// GET /api/products/:id
// Used by the product detail page.
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.status(200).json({ success: true, data: product });
});

// POST /api/products   (admin only, multipart/form-data with an "images" field)
const createProduct = asyncHandler(async (req, res) => {
  const { data, error } = validateProductInput(req.body, { create: true });
  if (error) return res.status(400).json({ success: false, message: error });

  const product = await Product.create({
    tenantId: req.tenantId,
    ...data,
    slug: slugify(data.name, { lower: true }),
    inStock: data.inStock === undefined ? true : data.inStock,
    featured: data.featured === undefined ? false : data.featured,
    images: req.processedImages || [],
  });

  res.status(201).json({ success: true, data: product });
});

// PUT /api/products/:id   (admin only, multipart/form-data if replacing photos)
// Sending new images ADDS to the existing set; delete old ones first via
// DELETE /api/products/:id/images/:publicId if you want to replace them.
const updateProduct = asyncHandler(async (req, res) => {
  const { data, error } = validateProductInput(req.body);
  if (error) return res.status(400).json({ success: false, message: error });
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  Object.assign(product, data);
  if (data.name) product.slug = slugify(data.name, { lower: true });

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
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  const publicId = decodeURIComponent(req.params.publicId);

  const imageExists = product.images.some((img) => img.public_id === publicId);
  if (!imageExists) {
    return res.status(404).json({ success: false, message: 'Product image not found' });
  }
  product.images = product.images.filter((img) => img.public_id !== publicId);
  await product.save();
  await deleteImage(publicId, req.tenant);

  res.status(200).json({ success: true, data: product });
});

// DELETE /api/products/:id   (admin only) — also removes its Cloudinary photos
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  await Promise.all((product.images || []).map((img) => deleteImage(img.public_id, req.tenant)));
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
  validateProductInput,
};
