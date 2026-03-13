// controllers/authController.js
// Handles user registration, login, and profile retrieval.

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../config/db");
require("dotenv").config();

// ── Helper: sign a JWT ────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { id: user.id, phone: user.phone, full_name: user.full_name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// ── Helper: write audit log entry ────────────────────────────
async function audit(conn, userId, action, detail, ip) {
  await conn.query(
    "INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, ip_address) VALUES (?,?,?,?,?,?)",
    [userId, action, "user", userId, JSON.stringify(detail), ip]
  );
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { phone, full_name, password } = req.body;

    // Check duplicate phone
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE phone = ?", [phone]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Phone number already registered" });
    }

    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (id, phone, full_name, password_hash, role) VALUES (?,?,?,?,'shopper')",
      [id, phone, full_name, hash]
    );

    const user = { id, phone, full_name, role: "shopper" };
    const token = signToken(user);

    await audit(pool, id, "register", { phone, full_name }, req.ip);

    res.status(201).json({ success: true, token, user });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    const [rows] = await pool.query(
      "SELECT id, phone, full_name, password_hash, role FROM users WHERE phone = ?",
      [phone]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid phone or password" });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid phone or password" });
    }

    // Update last_login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

    const token = signToken(user);
    await audit(pool, user.id, "login", { phone }, req.ip);

    res.json({
      success: true,
      token,
      user: { id: user.id, phone: user.phone, full_name: user.full_name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me  (protected)
// ─────────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, phone, full_name, role, created_at, last_login FROM users WHERE id = ?",
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    next(err);
  }
};
