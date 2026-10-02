const knownOrigins = [
  'https://rositawaters.com',
  'https://www.rositawaters.com',
  'https://rosita-waters-react.vercel.app',
  'https://rosita-waters.vercel.app',
  'https://campusify.net',
];

const whiteList = [
  ...knownOrigins,
  ...(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean),
  ...(process.env.NODE_ENV !== 'production'
    ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      ]
    : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || whiteList.includes(origin)) return callback(null, true);
    const error = new Error('Not allowed by CORS');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

module.exports = corsOptions;
