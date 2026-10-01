const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizePublicConfig } = require('../Utils/publicTenantConfig');
const { getTenantEnv } = require('../Utils/tenantConfig');

test('public tenant config allows safe, validated values and drops secrets', () => {
  const result = sanitizePublicConfig({
    brand: 'Example Shop',
    email: 'shop@example.test',
    phones: ['+234 800 000 0000', 'javascript:alert(1)'],
    socials: {
      instagram: 'https://instagram.example/shop',
      x: 'javascript:alert(1)',
      accessToken: 'must-not-leak',
    },
    images: {
      logo: 'https://images.example/logo.png',
      family: 'http://images.example/family.png',
      apiKey: 'must-not-leak',
    },
    showPrices: true,
    resendApiKey: 'must-not-leak',
    cloudinaryUrl: 'must-not-leak',
  });

  assert.deepEqual(result, {
    brand: 'Example Shop',
    email: 'shop@example.test',
    phones: ['+234 800 000 0000'],
    socials: { instagram: 'https://instagram.example/shop' },
    images: { logo: 'https://images.example/logo.png' },
    showPrices: true,
  });
});

test('integration credentials require tenant-specific environment variables', () => {
  const savedDefaultValue = process.env.RESEND_API_KEY;
  const savedTenantValue = process.env.TENANT_CHARLES_FISHES_RESEND_API_KEY;
  const savedRositaValue = process.env.TENANT_ROSITA_WATERS_RESEND_API_KEY;
  try {
    process.env.RESEND_API_KEY = 'legacy-default-key';
    process.env.TENANT_CHARLES_FISHES_RESEND_API_KEY = 'client-specific-key';
    delete process.env.TENANT_ROSITA_WATERS_RESEND_API_KEY;

    assert.equal(
      getTenantEnv({ key: 'charles-fishes' }, 'RESEND_API_KEY'),
      'client-specific-key'
    );
    assert.equal(
      getTenantEnv({ key: 'another-client' }, 'RESEND_API_KEY'),
      undefined
    );
    assert.equal(
      getTenantEnv({ key: 'rosita-waters' }, 'RESEND_API_KEY'),
      undefined
    );
  } finally {
    if (savedDefaultValue === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedDefaultValue;
    if (savedTenantValue === undefined) delete process.env.TENANT_CHARLES_FISHES_RESEND_API_KEY;
    else process.env.TENANT_CHARLES_FISHES_RESEND_API_KEY = savedTenantValue;
    if (savedRositaValue === undefined) delete process.env.TENANT_ROSITA_WATERS_RESEND_API_KEY;
    else process.env.TENANT_ROSITA_WATERS_RESEND_API_KEY = savedRositaValue;
  }
});
