// Protects the admin panel's create/update/delete calls.
//
// The admin panel sends:   Authorization: Bearer <ADMIN_API_KEY>
// and this middleware just checks that key matches the one in .env.
//
// This is intentionally simple for a small single-admin site. If the site
// later needs several staff logins with different permissions, replace this
// with real user accounts + JWTs (the same pattern as verifyJwt/verifyRoles
// in the reference backend).
const jwt = require('jsonwebtoken');
const AdminSession = require('../Models/adminSessionModel');
const Admin = require('../Models/adminModel');
const Tenant = require('../Models/tenantModel');

const adminAuth = async (req, res, next) => {
  const token = req.cookies?.rar_admin_session;
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({ message: 'Server authentication is not configured.' });
  }

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'rar-water-api',
      audience: 'rar-water-admin',
    });
    const [session, admin] = await Promise.all([
      AdminSession.findOne({ tokenId: claims.jti, admin: claims.sub }),
      Admin.findById(claims.sub).select('_id email role active tenantId'),
    ]);
    if (
      !session ||
      !admin ||
      !admin.active ||
      !admin.tenantId ||
      String(admin.tenantId) !== String(claims.tenantId)
    ) {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }
    const tenant = await Tenant.findOne({ _id: admin.tenantId, active: true });
    if (!tenant) {
      return res.status(403).json({ message: 'This client account is no longer active.' });
    }
    req.admin = admin;
    req.tenant = tenant;
    req.tenantId = tenant._id;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    }
    next(error);
  }
};

module.exports = adminAuth;
