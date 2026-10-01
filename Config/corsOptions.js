// Only these front-ends are allowed to call the API from a browser.
// Add the real rositawaters.com addresses (and any admin panel address)
// to ALLOWED_ORIGINS in your .env once you have them.
const whiteList = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // "!origin" allows tools like Postman/curl and same-server requests
    if (!origin || whiteList.length === 0 || whiteList.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200,
};

module.exports = corsOptions;
