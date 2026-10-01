# Rar Water — Backend API

The API behind the Rar Water website and admin panel: products, editable page
text (header/home/about/footer), and customer orders. Built the same way as
the reference backend you shared — Express + Mongoose, Multer + Sharp +
Cloudinary for images, one router/controller/model per resource — just scoped
down to what this site actually needs.

## 1. Install

```
npm install
```

## 2. Set up accounts (all have free tiers)

- **MongoDB Atlas** — create a free cluster, get its connection string.
- **Cloudinary** — sign up, copy Cloud name / API key / API secret from the Dashboard.

## 3. Configure environment

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URI` — your MongoDB Atlas connection string
- `ADMIN_API_KEY` — make up a long random string; the admin panel sends this to prove it's allowed to create/edit/delete
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `ALLOWED_ORIGINS` — the URLs allowed to call this API (your live site + admin panel)

## 4. Run it

```
npm run dev        # local development, auto-restarts on changes
npm start           # plain node
```

## 5. Deploy

`vercel.json` is included, so `vercel deploy` (or connecting the repo in the
Vercel dashboard) works directly. Add the same environment variables in the
Vercel project's Settings → Environment Variables.

---

## API reference

Public routes need nothing extra. Admin routes need this header:
`Authorization: Bearer <ADMIN_API_KEY>`

### Products

| Action | Method & path | Who |
|---|---|---|
| List products (optional `?category=sachet`) | `GET /api/products` | Public |
| Get one product | `GET /api/products/:id` | Public |
| Add a product (send as `multipart/form-data`, photos in an `images` field) | `POST /api/products` | Admin |
| Edit a product / add more photos | `PUT /api/products/:id` | Admin |
| Remove one photo from a product | `DELETE /api/products/:id/images/:publicId` | Admin |
| Delete a product (and its photos) | `DELETE /api/products/:id` | Admin |

Product fields: `name, category (sachet/bottled/jug/dispenser), size, pack, price, description, inStock, featured`.

### Page content (header, home, about, footer)

| Action | Method & path | Who |
|---|---|---|
| Get every section at once | `GET /api/content` | Public |
| Get one section | `GET /api/content/:section` | Public |
| Save a section | `PUT /api/content/:section` | Admin |

The body of a `PUT` is just whatever fields that section's admin form has —
e.g. `PUT /api/content/home` with `{ "heroTitle": "...", "heroSub": "...", "heroText": "..." }`.
No code change is needed to add a new text field; the admin form and the
website page just need to agree on the field name.

### Orders

| Action | Method & path | Who |
|---|---|---|
| Submit an order (the order drawer on the site) | `POST /api/orders` | Public |
| List orders (optional `?status=new`) | `GET /api/orders` | Admin |
| Get one order | `GET /api/orders/:id` | Admin |
| Update order status (`new/confirmed/fulfilled/cancelled`) | `PUT /api/orders/:id` | Admin |
| Delete an order | `DELETE /api/orders/:id` | Admin |

---

## How images flow (Cloudinary)

1. The admin panel sends photo(s) as `multipart/form-data` in an `images` field.
2. `Middlewares/uploadImages.js` saves them briefly to a local temp folder (Multer),
   resizes/compresses each one to a max 1000×1000 JPEG (Sharp),
   uploads the result to Cloudinary under `rarwater/products/…` (`Utils/cloudinary.js`),
   then deletes the local temp copies.
3. The controller saves `{ secure_url, public_id }` for each photo onto the
   product document. `secure_url` is what the website displays; `public_id`
   is what lets the API delete that exact photo from Cloudinary later.

## Notes / next steps

- **Admin login today** is one shared key (`ADMIN_API_KEY`), which is enough
  for a single admin. If more staff ever need their own logins, swap
  `Middlewares/adminAuth.js` for real accounts + JWTs — same idea as
  `verifyJwt`/`verifyRoles` in the reference backend, just not needed yet here.
- **Seeding starting content:** the very first time each `/api/content/:section`
  is requested before anything's been saved, it returns `{}` — the front end
  should fall back to its own placeholder text until the admin saves real copy.
