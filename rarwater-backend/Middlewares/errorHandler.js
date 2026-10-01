const notFound = (req, res, next) => {
  const error = new Error(`Not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err?.message || 'Something went wrong',
    // Only show the stack trace outside production, to avoid leaking details publicly
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  });
};

module.exports = { notFound, errorHandler };
