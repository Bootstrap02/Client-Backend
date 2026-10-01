const crypto = require('crypto');
const RateLimit = require('../Models/rateLimitModel');

const increment = async (key, now, windowMs) => {
  const cutoff = new Date(now.getTime() - windowMs);
  const nextWindowEnd = new Date(now.getTime() + windowMs);
  const update = [
    {
      $set: {
        count: {
          $cond: [
            { $gt: ['$windowStartedAt', cutoff] },
            { $add: [{ $ifNull: ['$count', 0] }, 1] },
            1,
          ],
        },
        windowStartedAt: {
          $cond: [{ $gt: ['$windowStartedAt', cutoff] }, '$windowStartedAt', now],
        },
        expiresAt: {
          $cond: [{ $gt: ['$windowStartedAt', cutoff] }, '$expiresAt', nextWindowEnd],
        },
      },
    },
  ];
  const options = { upsert: true, new: true };
  try {
    return await RateLimit.findOneAndUpdate({ key }, update, options);
  } catch (error) {
    if (error.code !== 11000) throw error;
    return RateLimit.findOneAndUpdate({ key }, update, options);
  }
};

const createRateLimit = ({ scope, windowMs, max, includeEmail = false }) =>
  async (req, res, next) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const keys = [`${scope}:ip:${ip}`];
      if (includeEmail && typeof req.body?.email === 'string') {
        keys.push(`${scope}:email:${req.body.email.trim().toLowerCase()}`);
      }
      const now = new Date();
      const results = await Promise.all(keys.map(async (value) => {
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
          throw new Error('Server rate limiting is not configured.');
        }
        const key = crypto.createHmac('sha256', process.env.JWT_SECRET).update(value).digest('hex');
        return increment(key, now, windowMs);
      }));
      if (results.some((result) => result.count > max)) {
        return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
      }
      next();
    } catch (error) {
      next(error);
    }
  };

module.exports = createRateLimit;
