
const cloudinary = require('cloudinary').v2;
const { getTenantEnv } = require('./tenantConfig');

const tenantCloudinaryOptions = (tenant) => {
  if (!tenant) throw new Error('Tenant context is required for image storage.');
  // A tenant may have its own Cloudinary account (TENANT_<KEY>_CLOUDINARY_URL).
  // Otherwise every tenant shares the platform account; images are kept apart
  // by the per-tenant folder used in uploadImage ("<tenant-key>/<folder>").
  const urlValue = getTenantEnv(tenant, 'CLOUDINARY_URL')
    || process.env.PLATFORM_CLOUDINARY_URL
    || process.env.CLOUDINARY_URL;
  if (!urlValue) throw new Error(`Image storage is not configured for tenant "${tenant.key}".`);

  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error(`Image storage configuration is invalid for tenant "${tenant.key}".`);
  }
  if (url.protocol !== 'cloudinary:' || !url.hostname || !url.username || !url.password) {
    throw new Error(`Image storage configuration is invalid for tenant "${tenant.key}".`);
  }
  return {
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
    secure: true,
  };
};

// Uploads one local file (already resized by sharp) to Cloudinary,
// inside a tenant-specific folder.
const uploadImage = async (imagePath, folder = 'products', tenant) => {
  const tenantOptions = tenantCloudinaryOptions(tenant);
  const options = {
    ...tenantOptions,
    folder: `${tenant.key}/${folder}`,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  };

  const result = await cloudinary.uploader.upload(imagePath, options);
  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    asset_id: result.asset_id,
  };
};

// Removes one image from Cloudinary by its public_id (stored alongside the
// product/content record so it can be cleaned up when replaced or deleted).
const deleteImage = async (publicId, tenant) => {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, tenantCloudinaryOptions(tenant));
};

module.exports = { cloudinary, uploadImage, deleteImage };
