
const notFound = (req, res, next) => {
  const error = new Error(`Not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err?.statusCode || err?.status || (res.statusCode === 200 ? 500 : res.statusCode);
  if (err?.name === 'ValidationError' || err?.name === 'CastError') statusCode = 400;
  // Upload problems (file too large, too many files, wrong field name) are the sender's mistake.
  if (err?.name === 'MulterError') {
    statusCode = 400;
    const limits = {
      LIMIT_FILE_SIZE: 'That image is too large. Please use one under 15MB.',
      LIMIT_FILE_COUNT: 'Too many images were sent.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field. Images must be sent in a field called "images" (maximum 6).',
    };
    err = Object.assign(new Error(limits[err.code] || 'The image upload was rejected.'), { name: 'MulterError' });
  }
  if (err?.code === 11000) statusCode = 409;
  // Server errors are hidden from the response, so log the real cause for the host's logs.
  if (statusCode >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err?.message || err);
  const message = statusCode >= 500 && !err?.expose
    ? 'Something went wrong'
    : err?.message || 'Something went wrong';
  res.status(statusCode).json({
    message,
    // Only show the stack trace outside production, to avoid leaking details publicly
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  });
};

module.exports = { notFound, errorHandler };
