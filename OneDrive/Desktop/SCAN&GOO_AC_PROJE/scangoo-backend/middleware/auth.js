// middleware/auth.js
// Verifies the JWT sent in the Authorization header.
// Attaches req.user = { id, phone, role } on success.

const jwt = require("jsonwebtoken");
require("dotenv").config();

function authenticate(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;   // { id, phone, full_name, role, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
