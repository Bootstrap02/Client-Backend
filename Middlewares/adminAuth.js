// Protects the admin panel's create/update/delete calls.
//
// The admin panel sends:   Authorization: Bearer <ADMIN_API_KEY>
// and this middleware just checks that key matches the one in .env.
//
// This is intentionally simple for a small single-admin site. If the site
// later needs several staff logins with different permissions, replace this
// with real user accounts + JWTs (the same pattern as verifyJwt/verifyRoles
// in the reference backend).
const adminAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ message: 'Server is missing ADMIN_API_KEY in its environment' });
  }
  if (!token || token !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ message: 'Not authorized. Missing or incorrect admin key.' });
  }
  next();
};

module.exports = adminAuth;
