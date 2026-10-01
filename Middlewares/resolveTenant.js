const Tenant = require('../Models/tenantModel');

const resolvePublicTenant = async (req, res, next) => {
  try {
    const origin = req.get('origin');
    if (!origin) {
      return res.status(400).json({ message: 'A registered website origin is required.' });
    }

    let hostname;
    try {
      hostname = new URL(origin).hostname.toLowerCase();
    } catch {
      return res.status(400).json({ message: 'The request origin is invalid.' });
    }

    const tenant = await Tenant.findOne({ domains: hostname, active: true });
    if (!tenant) {
      return res.status(403).json({ message: 'This website is not registered.' });
    }

    req.tenant = tenant;
    req.tenantId = tenant._id;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { resolvePublicTenant };
