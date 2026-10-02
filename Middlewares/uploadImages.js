const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const os = require('os');
const { promises: fsPromises } = require('fs');
const { uploadImage } = require('../Utils/cloudinary');

const TMP_DIR = path.join(os.tmpdir(), 'client-backend-uploads');

const ensureDir = async (dir) => {
  await fsPromises.mkdir(dir, { recursive: true });
};

// Step 1: accept the file(s) from the form and hold them briefly on disk
const multerStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureDir(TMP_DIR);
      cb(null, TMP_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}.jpg`);
  },
});

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG or WEBP images are allowed'), false);
  }
};

// Use as: uploadPhotos.array('images', 6)  — field name must match the
// front end's FormData field, e.g. form.append('images', file)
const uploadPhotos = multer({
  storage: multerStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
});

// Step 2: resize/compress each uploaded file, push it to Cloudinary, then
// delete the temporary local copy. Leaves req.processedImages as an array
// of { secure_url, public_id } ready to save on a Mongoose document.
const resizeAndUpload = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return next();

    const results = await Promise.all(
      req.files.map(async (file) => {
        const keepPng = Boolean(req.keepPng); // logos keep transparency
        const resizedPath = file.path.replace(/\.jpg$/, keepPng ? '-resized.png' : '-resized.jpg');
        try {
          const pipeline = sharp(file.path)
            .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true });
          await (keepPng ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 82 }))
            .toFile(resizedPath);

          const uploaded = await uploadImage(resizedPath, req.uploadFolder || 'products', req.tenant);
          return { secure_url: uploaded.secure_url, public_id: uploaded.public_id };
        } finally {
          await Promise.all([
            fsPromises.unlink(file.path).catch(() => {}),
            fsPromises.unlink(resizedPath).catch(() => {}),
          ]);
        }
      })
    );

    req.processedImages = results;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadPhotos, resizeAndUpload };
