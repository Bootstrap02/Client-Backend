
const notFound = (req, res, next) => {
  const error = new Error(`Not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err?.statusCode || err?.status || (res.statusCode === 200 ? 500 : res.statusCode);
  if (err?.name === 'ValidationError' || err?.name === 'CastError') statusCode = 400;
  if (err?.code === 11000) statusCode = 409;
  // Server errors are hidden from the response, so log the real cause for the host's logs.
  if (statusCode >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err?.message || err);
  const message = statusCode >= 500
    ? 'Something went wrong'
    : err?.message || 'Something went wrong';
  res.status(statusCode).json({
    message,
    // Only show the stack trace outside production, to avoid leaking details publicly
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  });
};

module.exports = { notFound, errorHandler };
