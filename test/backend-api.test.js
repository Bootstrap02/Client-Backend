const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const mongoose = require('mongoose');
const Product = require('../Models/productModel');
const Tenant = require('../Models/tenantModel');
const Admin = require('../Models/adminModel');
const AdminSession = require('../Models/adminSessionModel');
const Content = require('../Models/contentModel');
const Order = require('../Models/orderModel');
const RateLimit = require('../Models/rateLimitModel');
const { getProducts, getProduct, validateProductInput } = require('../Controllers/productController');
const { getAllContent, getContent } = require('../Controllers/contentController');
const { sanitizePublicContent } = require('../Utils/publicTenantConfig');
const { sendPasswordResetEmail } = require('../Utils/adminEmail');
const { notifyOrder } = require('../Utils/orderNotifications');
const platformRouter = require('../Routes/platformRoutes');
const authRouter = require('../Routes/authRoutes');
const contentRouter = require('../Routes/contentRoutes');
const tenantRouter = require('../Routes/tenantRoutes');

const responseCapture = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('public product reads are tenant-scoped, including individual product lookup', async (t) => {
  let filter;
  const products = [{ name: 'Tenant A product' }];
  t.mock.method(Product, 'find', (value) => {
    filter = value;
    return { sort: async () => products };
  });
  const listResponse = responseCapture();
  await getProducts(
    { tenantId: 'tenant-a', query: {} },
    listResponse,
    (error) => { throw error; }
  );
  assert.deepEqual(filter, { tenantId: 'tenant-a' });
  assert.deepEqual(listResponse.body.data, products);

  t.mock.method(Product, 'findOne', async (value) => {
    filter = value;
    return null;
  });
  const itemResponse = responseCapture();
  await getProduct(
    { tenantId: 'tenant-a', params: { id: 'product-from-tenant-b' } },
    itemResponse,
    (error) => { throw error; }
  );
  assert.deepEqual(filter, { _id: 'product-from-tenant-b', tenantId: 'tenant-a' });
  assert.equal(itemResponse.statusCode, 404);
});

test('product input validation rejects invalid categories, prices, and booleans', () => {
  const valid = {
    name: '  Spring Water ',
    category: 'bottled',
    size: '75cl',
    pack: 'Pack of 12',
    price: '1500',
    inStock: 'false',
  };
  assert.deepEqual(validateProductInput(valid, { create: true }), {
    data: {
      name: 'Spring Water',
      category: 'bottled',
      size: '75cl',
      pack: 'Pack of 12',
      price: 1500,
      inStock: false,
    },
  });
  assert.match(validateProductInput({ ...valid, category: 'other' }, { create: true }).error, /category/);
  assert.match(validateProductInput({ ...valid, price: 'NaN' }, { create: true }).error, /price/);
  assert.match(validateProductInput({ ...valid, featured: 'yes' }, { create: true }).error, /featured/);
});

test('public content drops sensitive values recursively but preserves website fields', () => {
  const date = new Date('2026-01-01T00:00:00.000Z');
  assert.deepEqual(sanitizePublicContent({
    home: {
      heroTitle: 'Welcome',
      resendApiKey: 'private',
      nested: [{ phone: '+1 555 0100', accessToken: 'private' }],
      updatedAt: date,
    },
    passwordResetToken: 'private',
  }), {
    home: {
      heroTitle: 'Welcome',
      nested: [{ phone: '+1 555 0100' }],
      updatedAt: date,
    },
  });
});

test('public website content and tenant info endpoints resolve and scope the tenant', async (t) => {
  let tenantFilter;
  let contentFilter;
  const tenant = {
    _id: 'tenant-a',
    key: 'rosita-waters',
    name: 'Rosita Waters',
    publicConfig: {
      brand: 'Rosita Waters',
      email: 'hello@example.test',
      resendApiKey: 'must-not-be-exposed',
    },
  };
  t.mock.method(Tenant, 'findOne', async (filter) => {
    tenantFilter = filter;
    return tenant;
  });
  t.mock.method(Content, 'find', async (filter) => {
    contentFilter = filter;
    return [{ section: 'home', data: { heroTitle: 'Fresh water', apiKey: 'private' } }];
  });
  t.mock.method(Content, 'findOne', async (filter) => {
    contentFilter = filter;
    return { data: { title: 'Our story', password: 'private' } };
  });

  const app = express();
  app.use('/api/content', contentRouter);
  app.use('/api/tenant', tenantRouter);
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path) => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { origin: 'https://rositawaters.com' },
    });
    return { status: response.status, body: await response.json() };
  };

  const allContent = await request('/content');
  assert.equal(allContent.status, 200);
  assert.deepEqual(contentFilter, { tenantId: 'tenant-a' });
  assert.deepEqual(allContent.body.data.home, { heroTitle: 'Fresh water' });

  const section = await request('/content/about');
  assert.equal(section.status, 200);
  assert.deepEqual(contentFilter, { tenantId: 'tenant-a', section: 'about' });
  assert.deepEqual(section.body.data, { title: 'Our story' });

  const info = await request('/tenant/config');
  assert.equal(info.status, 200);
  assert.deepEqual(tenantFilter, { domains: 'rositawaters.com', active: true });
  assert.equal(info.body.data.brand, 'Rosita Waters');
  assert.equal(info.body.data.email, 'hello@example.test');
  assert.equal(info.body.data.resendApiKey, undefined);
});

test('platform tenant management routes exist and require the platform API key', (t) => {
  const routes = platformRouter.stack
    .map((layer) => layer.route)
    .filter(Boolean)
    .map((route) => ({ path: route.path, methods: route.methods }));
  assert.ok(routes.some((route) => route.path === '/tenants' && route.methods.get));
  assert.ok(routes.some((route) => route.path === '/tenants' && route.methods.post));
  assert.ok(routes.some((route) => route.path === '/tenants/:key' && route.methods.patch));
  assert.ok(routes.some((route) => route.path === '/tenants/:key' && route.methods.delete));

  const authLayer = platformRouter.stack.find((layer) => layer.handle.name === 'platformAuth');
  assert.ok(authLayer);
  const previousKey = process.env.PLATFORM_ADMIN_API_KEY;
  process.env.PLATFORM_ADMIN_API_KEY = 'test-platform-key-with-at-least-32-characters';
  try {
    let status;
    let payload;
    let nextCalled = false;
    authLayer.handle(
      { get: () => 'Bearer incorrect-key' },
      {
        status(code) {
          status = code;
          return this;
        },
        json(body) {
          payload = body;
          return this;
        },
      },
      () => { nextCalled = true; }
    );
    assert.equal(status, 401);
    assert.equal(payload.message, 'Platform authorization is required.');
    assert.equal(nextCalled, false);
  } finally {
    if (previousKey === undefined) delete process.env.PLATFORM_ADMIN_API_KEY;
    else process.env.PLATFORM_ADMIN_API_KEY = previousKey;
  }
});

test('platform client list, create, update, and delete work with tenant-owned cleanup', async (t) => {
  const envKeys = [
    'PLATFORM_ADMIN_API_KEY',
    'JWT_SECRET',
    'TENANT_CHARLES_FISHES_RESEND_API_KEY',
    'TENANT_CHARLES_FISHES_RESEND_FROM_EMAIL',
  ];
  const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const platformKey = 'test-platform-key-with-at-least-32-characters';
  process.env.PLATFORM_ADMIN_API_KEY = platformKey;
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
  process.env.TENANT_CHARLES_FISHES_RESEND_API_KEY = 'test-client-email-key';
  process.env.TENANT_CHARLES_FISHES_RESEND_FROM_EMAIL = 'admin@example.test';

  let tenant;
  let deletedTenant = false;
  const deleted = {};
  const owner = {
    _id: 'owner-id',
    id: 'owner-id',
    email: 'owner@charles.example.test',
    tenantId: 'tenant-id',
    save: async () => {},
    deleteOne: async () => {},
  };
  const tenantQuery = (result) => ({
    select() { return this; },
    sort: async () => result,
  });
  t.mock.method(Tenant, 'find', () => tenantQuery(tenant ? [tenant] : []));
  t.mock.method(Tenant, 'exists', async () => false);
  t.mock.method(Tenant, 'create', async (data) => {
    tenant = {
      ...data,
      _id: 'tenant-id',
      id: 'tenant-id',
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      save: async () => {},
      deleteOne: async () => { deletedTenant = true; },
    };
    return tenant;
  });
  t.mock.method(Tenant, 'findById', async () => tenant);
  t.mock.method(Tenant, 'findOne', async () => tenant);
  t.mock.method(Tenant, 'findOneAndUpdate', async (_filter, update) => {
    if (update?.$set?.active === false) tenant.active = false;
    return tenant;
  });
  t.mock.method(Admin, 'create', async (data) => Object.assign(owner, data));
  t.mock.method(Admin, 'find', () => ({
    select() { return this; },
    session: async () => [{ _id: owner._id }],
  }));
  t.mock.method(Admin, 'deleteMany', async (filter) => { deleted.admins = filter; });
  t.mock.method(AdminSession, 'deleteMany', async (filter) => { deleted.sessions = filter; });
  t.mock.method(Product, 'find', () => ({
    select() { return this; },
    lean: async () => [],
  }));
  t.mock.method(Product, 'deleteMany', async (filter) => { deleted.products = filter; });
  t.mock.method(Content, 'deleteMany', async (filter) => { deleted.content = filter; });
  t.mock.method(Order, 'deleteMany', async (filter) => { deleted.orders = filter; });
  t.mock.method(RateLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
  t.mock.method(mongoose.connection, 'transaction', async (callback) => callback({}));
  global.fetch = async (url, options) => {
    if (url === 'https://api.resend.com/emails') return { ok: true };
    return originalFetch(url, options);
  };

  const app = express();
  app.use(express.json());
  app.use('/api/platform', platformRouter);
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/platform`;
  const request = async (method, path, body, authorized = true) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(authorized ? { authorization: `Bearer ${platformKey}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };

  assert.equal((await request('GET', '/tenants', undefined, false)).status, 401);
  const created = await request('POST', '/tenants', {
    key: 'charles-fishes',
    name: 'Charles Fishes',
    domains: ['charles.example.test'],
    ownerEmail: owner.email,
    publicConfig: { brand: 'Charles Fishes', resendApiKey: 'must-not-be-returned' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.key, 'charles-fishes');

  const listed = await request('GET', '/tenants');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].publicConfig.resendApiKey, undefined);

  const updated = await request('PATCH', '/tenants/charles-fishes', {
    name: 'Charles Fishes Limited',
    active: false,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'Charles Fishes Limited');
  assert.equal(tenant.active, false);

  const removed = await request('DELETE', '/tenants/charles-fishes');
  assert.equal(removed.status, 200);
  assert.deepEqual(deleted.products, { tenantId: 'tenant-id' });
  assert.deepEqual(deleted.content, { tenantId: 'tenant-id' });
  assert.deepEqual(deleted.orders, { tenantId: 'tenant-id' });
  assert.deepEqual(deleted.admins, { tenantId: 'tenant-id' });
  assert.deepEqual(deleted.sessions, { admin: { $in: ['owner-id'] } });
  assert.equal(deletedTenant, true);
});

test('password reset email selects the tenant-specific Resend key', async (t) => {
  const keys = [
    'TENANT_ROSITA_WATERS_RESEND_API_KEY',
    'TENANT_ROSITA_WATERS_RESEND_FROM_EMAIL',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  let request;
  t.mock.method(Tenant, 'findById', async () => ({ key: 'rosita-waters', name: 'Rosita Waters' }));
  process.env.TENANT_ROSITA_WATERS_RESEND_API_KEY = 'tenant-only-resend-test-key';
  process.env.TENANT_ROSITA_WATERS_RESEND_FROM_EMAIL = 'admin@example.test';
  process.env.RESEND_API_KEY = 'must-not-be-used';
  process.env.RESEND_FROM_EMAIL = 'wrong@example.test';
  global.fetch = async (_url, options) => {
    request = options;
    return { ok: true };
  };
  try {
    await sendPasswordResetEmail({ tenantId: 'tenant-a', email: 'owner@example.test' }, '123456');
    assert.equal(request.headers.Authorization, 'Bearer tenant-only-resend-test-key');
    assert.match(request.body, /admin@example\.test/);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('order notification uses tenant Resend configuration and does not use global credentials', async (t) => {
  const keys = [
    'TENANT_CHARLES_FISHES_RESEND_API_KEY',
    'TENANT_CHARLES_FISHES_RESEND_FROM_EMAIL',
    'TENANT_CHARLES_FISHES_ORDER_NOTIFICATION_EMAIL',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  let authorization;
  process.env.TENANT_CHARLES_FISHES_RESEND_API_KEY = 'charles-resend-test-key';
  process.env.TENANT_CHARLES_FISHES_RESEND_FROM_EMAIL = 'orders@example.test';
  process.env.TENANT_CHARLES_FISHES_ORDER_NOTIFICATION_EMAIL = 'owner@example.test';
  process.env.RESEND_API_KEY = 'wrong-global-key';
  process.env.RESEND_FROM_EMAIL = 'wrong-global@example.test';
  global.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return { ok: true };
  };
  try {
    const result = await notifyOrder(
      { key: 'charles-fishes', name: 'Charles Fishes' },
      {
        ref: 'ORD-TEST',
        customer: { name: 'Customer', phone: '+12345678', mode: 'pickup', address: '', note: '' },
        items: [{ qty: 1, name: 'Water', pack: 'Pack', unitPrice: 5 }],
        total: 5,
      }
    );
    assert.equal(result.email, 'sent');
    assert.equal(result.whatsapp, 'not_configured');
    assert.equal(authorization, 'Bearer charles-resend-test-key');

    delete process.env.TENANT_CHARLES_FISHES_RESEND_API_KEY;
    authorization = undefined;
    const noTenantCredential = await notifyOrder(
      { key: 'charles-fishes', name: 'Charles Fishes' },
      {
        ref: 'ORD-TEST',
        customer: { name: 'Customer', phone: '+12345678', mode: 'pickup', address: '', note: '' },
        items: [],
        total: 0,
      }
    );
    assert.equal(noTenantCredential.email, 'not_configured');
    assert.equal(authorization, undefined);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('password reset consumes the hashed one-time token and revokes sessions', async (t) => {
  let updateFilter;
  let update;
  let sessionFilter;
  t.mock.method(Admin, 'findOneAndUpdate', (filter, change) => {
    updateFilter = filter;
    update = change;
    return { select: async () => ({ _id: 'admin-id' }) };
  });
  t.mock.method(AdminSession, 'deleteMany', async (filter) => {
    sessionFilter = filter;
    return { deletedCount: 1 };
  });

  const resetToken = 'temporary-reset-token';
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const route = authRouter.stack
    .find((layer) => layer.route?.path === '/reset-password')
    .route.stack[1].handle;
  const response = responseCapture();
  await route(
    { body: { token: resetToken, password: 'long-enough-password-42' } },
    response,
    (error) => { throw error; }
  );

  assert.equal(updateFilter.resetTokenHash, resetTokenHash);
  assert.notEqual(updateFilter.resetTokenHash, resetToken);
  assert.equal(await bcrypt.compare('long-enough-password-42', update.$set.passwordHash), true);
  assert.ok(update.$unset.resetTokenHash);
  assert.deepEqual(sessionFilter, { admin: 'admin-id' });
  assert.equal(response.body.success, true);
});

test('admin login, forgot-password, OTP verification, and reset run as one flow', async (t) => {
  const envKeys = [
    'JWT_SECRET',
    'TENANT_ROSITA_WATERS_RESEND_API_KEY',
    'TENANT_ROSITA_WATERS_RESEND_FROM_EMAIL',
  ];
  const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
  process.env.TENANT_ROSITA_WATERS_RESEND_API_KEY = 'test-rosita-email-key';
  process.env.TENANT_ROSITA_WATERS_RESEND_FROM_EMAIL = 'admin@example.test';

  const admin = {
    _id: 'admin-id',
    id: 'admin-id',
    tenantId: 'tenant-id',
    email: 'owner@rosita.example.test',
    active: true,
    role: 'owner',
    passwordHash: await bcrypt.hash('current-password-42', 12),
    resetOtpAttempts: 0,
    save: async () => {},
  };
  const tenant = { _id: 'tenant-id', id: 'tenant-id', key: 'rosita-waters', name: 'Rosita Waters' };
  let mail;
  let sessionCreated = false;
  let sessionRevoked = false;
  let resetConsumed = false;
  const asQuery = (value) => ({
    select() { return this; },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  });
  t.mock.method(Admin, 'findOne', ({ email }) => asQuery(email === admin.email ? admin : null));
  t.mock.method(Admin, 'updateOne', async (_filter, change) => {
    Object.assign(admin, change.$set || {});
    if (change.$unset?.resetOtpHash) {
      delete admin.resetOtpHash;
      delete admin.resetOtpExpiresAt;
    }
    return { modifiedCount: 1 };
  });
  t.mock.method(Admin, 'findOneAndUpdate', (filter, change) => {
    const matches = !resetConsumed && filter.resetTokenHash === admin.resetTokenHash;
    if (matches) {
      resetConsumed = true;
      Object.assign(admin, change.$set);
      for (const field of Object.keys(change.$unset || {})) delete admin[field];
    }
    return { select: async () => matches ? { _id: admin._id } : null };
  });
  t.mock.method(Tenant, 'findOne', async () => tenant);
  t.mock.method(Tenant, 'findById', async () => tenant);
  t.mock.method(AdminSession, 'create', async () => { sessionCreated = true; });
  t.mock.method(AdminSession, 'deleteMany', async () => { sessionRevoked = true; });
  global.fetch = async (url, options) => {
    if (url === 'https://api.resend.com/emails') {
      mail = JSON.parse(options.body);
      return { ok: true };
    }
    return originalFetch(url, options);
  };

  t.after(() => {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  const callAuthRoute = async (path, body) => {
    const route = authRouter.stack.find((layer) => layer.route?.path === path);
    const handler = route.route.stack[1].handle;
    const response = responseCapture();
    response.cookie = (_name, value) => { response.cookieValue = value; };
    await handler({ body }, response, (error) => { throw error; });
    return response;
  };

  const login = await callAuthRoute('/login', {
    email: admin.email,
    password: 'current-password-42',
  });
  assert.equal(login.body.success, true);
  assert.ok(login.cookieValue);
  assert.equal(sessionCreated, true);

  const forgot = await callAuthRoute('/forgot-password', { email: admin.email });
  assert.equal(forgot.statusCode, 202);
  assert.match(mail.text, /\d{6}/);
  assert.ok(admin.resetOtpExpiresAt > new Date());
  const otp = mail.text.match(/code is (\d{6})/)[1];

  const unknownAccount = await callAuthRoute('/forgot-password', { email: 'missing@example.test' });
  assert.equal(unknownAccount.statusCode, 202);
  assert.equal(unknownAccount.body.message, forgot.body.message);

  const verify = await callAuthRoute('/verify-otp', { email: admin.email, otp });
  assert.equal(verify.body.success, true);
  assert.ok(verify.body.data.resetToken);
  assert.equal(admin.resetOtpHash, undefined);

  const reset = await callAuthRoute('/reset-password', {
    token: verify.body.data.resetToken,
    password: 'new-password-which-is-long-enough',
  });
  assert.equal(reset.body.success, true);
  assert.equal(await bcrypt.compare('new-password-which-is-long-enough', admin.passwordHash), true);
  assert.equal(sessionRevoked, true);

  const replay = await callAuthRoute('/reset-password', {
    token: verify.body.data.resetToken,
    password: 'another-valid-password-123',
  });
  assert.equal(replay.statusCode, 400);
});
