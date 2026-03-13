// middleware/errorHandler.js
// Global Express error handler – catches anything passed to next(err).

function errorHandler(err, req, res, next) {  // eslint-disable-line no-unused-vars
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // MySQL duplicate entry
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ success: false, message: "Duplicate entry – resource already exists" });
  }

  // express-validator errors are forwarded as 400
  if (err.status === 400) {
    return res.status(400).json({ success: false, message: err.message });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
  });
}

module.exports = errorHandler;
