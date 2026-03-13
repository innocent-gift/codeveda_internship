// controllers/adminController.js
// Admin-only endpoints: live session monitor, revenue analytics,
// alerts management, user list, audit log.

const { pool } = require("../config/db");

// ─────────────────────────────────────────────────────────────
// GET /api/admin/live-sessions
// Returns all currently active sessions with full cart contents
// ─────────────────────────────────────────────────────────────
exports.getLiveSessions = async (req, res, next) => {
  try {
    const [sessions] = await pool.query(
      `SELECT s.id, s.status, s.started_at,
              s.total_rwf, s.total_items, s.total_weight_kg,
              u.id AS user_id, u.full_name, u.phone
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status IN ('active', 'paying')
       ORDER BY s.started_at DESC`
    );

    // Fetch cart items for each session
    const enriched = await Promise.all(
      sessions.map(async (sess) => {
        const [items] = await pool.query(
          `SELECT si.product_id, si.quantity, si.unit_price, si.subtotal, si.scanned_at,
                  p.name, p.emoji, p.weight_kg, p.category, p.age_restricted
           FROM session_items si
           JOIN products p ON p.id = si.product_id
           WHERE si.session_id = ?
           ORDER BY si.scanned_at`,
          [sess.id]
        );
        return { ...sess, items };
      })
    );

    res.json({ success: true, count: enriched.length, sessions: enriched });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/admin/dashboard
// KPI summary: active shoppers, items in carts, today's revenue,
// completed sessions, top products
// ─────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    // Active shoppers
    const [[{ active_shoppers }]] = await pool.query(
      "SELECT COUNT(*) AS active_shoppers FROM sessions WHERE status IN ('active','paying')"
    );

    // Items currently in all active carts
    const [[{ live_items }]] = await pool.query(
      `SELECT COALESCE(SUM(si.quantity), 0) AS live_items
       FROM session_items si
       JOIN sessions s ON s.id = si.session_id
       WHERE s.status IN ('active','paying')`
    );

    // Live cart value
    const [[{ live_value }]] = await pool.query(
      `SELECT COALESCE(SUM(s.total_rwf), 0) AS live_value
       FROM sessions s
       WHERE s.status IN ('active','paying')`
    );

    // Today's completed sessions
    const [[{ completed_today }]] = await pool.query(
      `SELECT COUNT(*) AS completed_today
       FROM sessions
       WHERE status = 'completed' AND DATE(completed_at) = CURDATE()`
    );

    // Today's revenue
    const [[{ revenue_today }]] = await pool.query(
      `SELECT COALESCE(SUM(total_rwf), 0) AS revenue_today
       FROM sessions
       WHERE status = 'completed' AND DATE(completed_at) = CURDATE()`
    );

    // Unresolved alerts
    const [[{ open_alerts }]] = await pool.query(
      "SELECT COUNT(*) AS open_alerts FROM price_alerts WHERE resolved = 0"
    );

    // Top 5 products by units sold today (across all sessions)
    const [top_products] = await pool.query(
      `SELECT p.id, p.name, p.emoji,
              COALESCE(SUM(si.quantity), 0)  AS units_sold,
              COALESCE(SUM(si.subtotal), 0)  AS total_revenue
       FROM products p
       LEFT JOIN session_items si ON si.product_id = p.id
       LEFT JOIN sessions s ON s.id = si.session_id
         AND DATE(s.started_at) = CURDATE()
       GROUP BY p.id, p.name, p.emoji
       ORDER BY units_sold DESC
       LIMIT 5`
    );

    res.json({
      success: true,
      dashboard: {
        active_shoppers,
        live_items,
        live_value,
        completed_today,
        revenue_today,
        open_alerts,
        top_products,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/admin/completed-sessions?date=YYYY-MM-DD
// All completed sessions for a given day (default: today)
// ─────────────────────────────────────────────────────────────
exports.getCompletedSessions = async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const [sessions] = await pool.query(
      `SELECT s.id, s.status, s.started_at, s.completed_at,
              s.total_rwf, s.total_items, s.total_weight_kg,
              s.payment_method, s.txn_id,
              u.full_name, u.phone
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'completed' AND DATE(s.completed_at) = ?
       ORDER BY s.completed_at DESC`,
      [date]
    );

    const total_revenue = sessions.reduce((sum, s) => sum + s.total_rwf, 0);
    const total_items   = sessions.reduce((sum, s) => sum + s.total_items, 0);

    res.json({
      success: true,
      date,
      summary: { total_sessions: sessions.length, total_revenue, total_items },
      sessions,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/admin/alerts?resolved=0
// Price mismatch, age restriction, and weight alerts
// ─────────────────────────────────────────────────────────────
exports.getAlerts = async (req, res, next) => {
  try {
    const resolved = req.query.resolved !== undefined ? parseInt(req.query.resolved) : 0;
    const [alerts] = await pool.query(
      `SELECT pa.*, p.name AS product_name, p.emoji,
              s.id AS session_id, u.full_name, u.phone
       FROM price_alerts pa
       LEFT JOIN products p  ON p.id  = pa.product_id
       LEFT JOIN sessions s  ON s.id  = pa.session_id
       LEFT JOIN users u     ON u.id  = s.user_id
       WHERE pa.resolved = ?
       ORDER BY pa.created_at DESC
       LIMIT 50`,
      [resolved]
    );
    res.json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/alerts/:id/resolve  – mark alert resolved
// ─────────────────────────────────────────────────────────────
exports.resolveAlert = async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE price_alerts SET resolved = 1 WHERE id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Alert not found" });
    }
    res.json({ success: true, message: "Alert resolved" });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/admin/inventory
// Units sold + revenue per product (all sessions, active + completed)
// ─────────────────────────────────────────────────────────────
exports.getInventory = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.emoji, p.price_rwf, p.category, p.in_stock,
              COALESCE(SUM(si.quantity), 0) AS units_in_carts,
              COALESCE(SUM(si.subtotal),  0) AS cart_revenue
       FROM products p
       LEFT JOIN session_items si ON si.product_id = p.id
       GROUP BY p.id, p.name, p.emoji, p.price_rwf, p.category, p.in_stock
       ORDER BY units_in_carts DESC`
    );
    res.json({ success: true, inventory: rows });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/admin/users        – list all shoppers
// ─────────────────────────────────────────────────────────────
exports.getUsers = async (req, res, next) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.phone, u.full_name, u.role, u.created_at, u.last_login,
              COUNT(s.id) AS total_sessions,
              COALESCE(SUM(s.total_rwf), 0) AS lifetime_spend
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id AND s.status = 'completed'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/admin/audit-log?limit=50&offset=0
// ─────────────────────────────────────────────────────────────
exports.getAuditLog = async (req, res, next) => {
  try {
    const limit  = parseInt(req.query.limit)  || 50;
    const offset = parseInt(req.query.offset) || 0;

    const [rows] = await pool.query(
      `SELECT al.*, u.full_name, u.phone
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json({ success: true, logs: rows });
  } catch (err) {
    next(err);
  }
};
