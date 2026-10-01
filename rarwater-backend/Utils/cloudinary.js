const cloudinary = require('cloudinary').v2;

cloudinary.config({
  secure: true
});

// Uploads one local file (already resized by sharp) to Cloudinary,
// inside a "rarwater" folder so it's easy to find in the dashboard.
const uploadImage = async (imagePath, folder = 'rarwater') => {
  const options = {
    folder,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  };

  try {
    const result = await cloudinary.uploader.upload(imagePath, options);
    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
      asset_id: result.asset_id,
    };
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    return null;
  }
};

// Removes one image from Cloudinary by its public_id (stored alongside the
// product/content record so it can be cleaned up when replaced or deleted).
const deleteImage = async (publicId) => {
  if (!publicId) return null;
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    return null;
  }
};

module.exports = { cloudinary, uploadImage, deleteImage };
