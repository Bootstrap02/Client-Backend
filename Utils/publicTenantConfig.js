const STRING_FIELDS = ['brand', 'company', 'address', 'whatsapp', 'email', 'currency'];
const SOCIAL_FIELDS = ['facebook', 'instagram', 'x', 'tiktok', 'youtube'];
const IMAGE_FIELDS = ['logo', 'homeHero', 'sachet', 'bottled', 'jug', 'dispenser', 'factory', 'family', 'flyer'];

const sanitizePublicConfig = (input = {}) => {
  const config = {};
  for (const field of STRING_FIELDS) {
    if (typeof input[field] === 'string' && input[field].length <= 500) {
      config[field] = input[field];
    }
  }
  if (Array.isArray(input.phones) && input.phones.length <= 10) {
    config.phones = input.phones.filter(
      (phone) => typeof phone === 'string' && phone.length <= 25 && /^[+0-9() .-]+$/.test(phone)
    );
  }
  if (input.showPrices === true || input.showPrices === false) {
    config.showPrices = input.showPrices;
  }
  if (input.socials && typeof input.socials === 'object' && !Array.isArray(input.socials)) {
    config.socials = Object.fromEntries(
      SOCIAL_FIELDS
        .filter((field) =>
          typeof input.socials[field] === 'string'
          && input.socials[field].length <= 500
          && (!input.socials[field] || /^https?:\/\//i.test(input.socials[field]))
        )
        .map((field) => [field, input.socials[field]])
    );
  }
  if (input.images && typeof input.images === 'object' && !Array.isArray(input.images)) {
    config.images = Object.fromEntries(
      IMAGE_FIELDS
        .filter((field) =>
          typeof input.images[field] === 'string'
          && input.images[field].length <= 2048
          && (!input.images[field] || /^https:\/\//i.test(input.images[field]))
        )
        .map((field) => [field, input.images[field]])
    );
  }
  return config;
};

const privateField = /(password|secret|token|api.?key|credential|private.?key|authorization)/i;

const sanitizePublicContent = (value) => {
  if (Array.isArray(value)) return value.map(sanitizePublicContent);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !privateField.test(key))
      .map(([key, child]) => [key, sanitizePublicContent(child)])
  );
};

module.exports = { sanitizePublicConfig, sanitizePublicContent, IMAGE_FIELDS };
