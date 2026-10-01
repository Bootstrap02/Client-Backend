# Multi-tenant Client API

Express and MongoDB API used by the Rosita Waters storefront and admin app.
One backend and database serve multiple clients; client-owned records are scoped
to a tenant, and public requests are matched to the tenant by registered
website domain.

## Configure

Copy `.env.example` to `.env` for local development. In the API host's
environment settings, configure:

- `DATABASE_URI` — MongoDB connection string.
- `JWT_SECRET` — at least 32 random bytes (`openssl rand -hex 32`).
- `OWNER_EMAIL` — the default tenant owner's email; provisioned at API startup.
- `PLATFORM_ADMIN_API_KEY` — a private, 32-byte-or-longer key for tenant
  onboarding. Never put it in a frontend.
- `DEFAULT_TENANT_KEY`, `DEFAULT_TENANT_NAME`, and `DEFAULT_TENANT_DOMAINS` —
  the initial tenant and its bare hostnames.
- `TENANT_<KEY>_CLOUDINARY_URL`, `TENANT_<KEY>_RESEND_API_KEY`, and
  `TENANT_<KEY>_RESEND_FROM_EMAIL` — tenant-specific server credentials (use
  the uppercase tenant key with hyphens replaced by underscores).
- `TENANT_<KEY>_ORDER_NOTIFICATION_EMAIL`,
  `TENANT_<KEY>_WHATSAPP_ACCESS_TOKEN`,
  `TENANT_<KEY>_WHATSAPP_PHONE_NUMBER_ID`, and
  `TENANT_<KEY>_WHATSAPP_ORDER_RECIPIENT` — optional order notification
  settings for that client.
- `ALLOWED_ORIGINS` — comma-separated storefront/admin origins. The deployed
  Rosita Water domains and `https://campusify.net` are also included in the
  CORS allowlist in `Config/corsOptions.js`.
- `NODE_ENV=production` in production. This enables secure cross-site,
  HTTP-only session cookies.

Do not put backend credentials in either frontend. Both Vite apps use
`VITE_API_URL` (defaulting to the hosted API URL) to select the API. Resend
credentials have no global fallback: for Rosita Waters configure
`TENANT_ROSITA_WATERS_RESEND_API_KEY` and
`TENANT_ROSITA_WATERS_RESEND_FROM_EMAIL`. Cloudinary's unprefixed setting is
still supported only as a default-tenant fallback.

The first startup creates an owner account for `OWNER_EMAIL` with a random,
unusable password. After that tenant's Resend sender is configured, use
**Forgot password?** on the admin sign-in page to receive a one-time code and
set the owner's password. A newly created admin is also sent a one-time code.
The initial database startup migrates records without a tenant to the default
tenant when it is the only tenant present.

## Run

Requires Node.js 20.9.0 or later.

```sh
npm install
npm run dev
```

## API

Admin authentication uses a signed JWT in an HTTP-only cookie backed by a
revocable MongoDB session. The signed session contains the admin's tenant ID;
protected product, content, order, and admin-user operations are scoped to that
tenant. The admin app sends credentialed requests; tokens are never stored in
browser local storage. OTPs expire after 10 minutes, are stored as keyed hashes,
and allow at most five verification attempts. Authentication, OTP, order, and
tenant-provisioning routes use MongoDB-backed rate limits.

To onboard a client, configure its tenant-prefixed integration variables and
allowed browser origin, then call the backend-only provisioning API:

```http
POST /api/platform/tenants
Authorization: Bearer <PLATFORM_ADMIN_API_KEY>
Content-Type: application/json

{
  "key": "charles-fishes",
  "name": "Charles Fishes",
  "domains": ["charlesfishes.example.com"],
  "ownerEmail": "owner@charlesfishes.example.com",
  "publicConfig": { "brand": "Charles Fishes" }
}
```

`domains` are bare hostnames entered by the platform operator after domain
ownership is confirmed. Browser public APIs resolve the tenant from the
request's `Origin` hostname; clients cannot select an arbitrary tenant ID.
Sensitive integration credentials remain in backend environment variables and
are never returned by `/api/tenant/config`.

| Method and path | Access | Purpose |
|---|---|---|
| `POST /api/auth/login` | Public | Start an admin session |
| `POST /api/auth/logout` | Public | Revoke the current session |
| `GET /api/auth/me` | Admin | Read current session/account |
| `POST /api/auth/forgot-password` | Public | Email a one-time password-reset OTP |
| `POST /api/auth/verify-otp` | Public | Verify OTP and issue a short-lived reset token |
| `POST /api/auth/reset-password` | Public | Set a new password using the verified token |
| `GET /api/admins` | Owner | List admin accounts |
| `POST /api/admins` | Owner | Create an admin and email its setup OTP |
| `PATCH /api/admins/:id` | Owner | Change an admin email or active status |
| `DELETE /api/admins/:id` | Owner | Delete an admin and revoke sessions |
| `POST /api/admins/:id/reset-password` | Owner | Email a password setup/reset OTP |
| `POST /api/platform/tenants` | Platform API key | Create a tenant and invite its owner |
| `GET /api/platform/tenants` | Platform API key | List all tenants |
| `PATCH /api/platform/tenants/:key` | Platform API key | Update tenant domains, activation, or public settings |
| `DELETE /api/platform/tenants/:key` | Platform API key | Deactivate and delete tenant data |

The default owner account is provisioned from `OWNER_EMAIL`; only a tenant's
owner can manage that tenant's admin accounts. Tenant and admin account
management routes are available through protected APIs and are not exposed in
the admin app.

### Products and content

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/products` and `GET /api/products/:id` | Public | Read products |
| `POST /api/products` and `PUT /api/products/:id` | Admin | Create/update product; optional `images` multipart file(s) |
| `DELETE /api/products/:id` | Admin | Delete product and its Cloudinary images |
| `GET /api/content` and `GET /api/content/:section` | Public | Read page sections |
| `PUT /api/content/:section` | Admin | Save header, home, about, or footer content |
| `GET /api/tenant/config` | Public | Read allowlisted, non-secret tenant branding/contact settings |
| `GET/PUT /api/tenant/admin-config` | Admin | Read or update tenant branding, contact settings, and public image URLs |
| `POST /api/orders` | Public | Validate and save an order, then attempt configured email/WhatsApp notifications |
| `GET /api/orders` and `GET /api/orders/:id` | Admin | Read submitted orders |
| `PUT /api/orders/:id` and `DELETE /api/orders/:id` | Admin | Update or delete orders |

The admin uploads images as `multipart/form-data` in the `images` field.
`Middlewares/uploadImages.js` validates, resizes and compresses each file,
uploads it with that tenant's Cloudinary credentials under its tenant folder,
and removes its temporary local copy. Cloudinary errors fail the API request
rather than returning a successful product with a missing image. The product
document stores the secure image URL and Cloudinary public ID. Order prices and
item names are recalculated from the tenant's current products; client-provided
totals and descriptions are not trusted. The response reports each notification
channel as `sent`, `failed`, or `not_configured`.

Successful password resets revoke existing sessions. Logging out also revokes
the server-side session immediately.
