// controllers/sessionController.js
// Core shopping-cart logic: create session, scan items, update qty,
// remove items, get cart state, checkout, verify QR at exit.

const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { pool } = require("../config/db");

// ── Helper: recalculate session totals from session_items ────
async function recalcSession(conn, sessionId) {
  const [rows] = await conn.query(
    `SELECT
       COALESCE(SUM(quantity), 0)  AS total_items,
       COALESCE(SUM(subtotal), 0)  AS total_rwf
     FROM session_items
     WHERE session_id = ?`,
    [sessionId]
  );
  const { total_items, total_rwf } = rows[0];

  // Also recalculate weight by joining products
  const [wRows] = await conn.query(
    `SELECT COALESCE(SUM(si.quantity * p.weight_kg), 0) AS total_weight
     FROM session_items si
     JOIN products p ON p.id = si.product_id
     WHERE si.session_id = ?`,
    [sessionId]
  );
  const total_weight_kg = wRows[0].total_weight;

  await conn.query(
    `UPDATE sessions SET total_items = ?, total_rwf = ?, total_weight_kg = ?
     WHERE id = ?`,
    [total_items, total_rwf, total_weight_kg, sessionId]
  );
  return { total_items, total_rwf, total_weight_kg };
}

// ── Helper: get full session with items ──────────────────────
async function getSessionFull(sessionId) {
  const [sessions] = await pool.query(
    `SELECT s.*, u.full_name, u.phone
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [sessionId]
  );
  if (sessions.length === 0) return null;

  const [items] = await pool.query(
    `SELECT si.*, p.name, p.emoji, p.weight_kg, p.category, p.age_restricted
     FROM session_items si
     JOIN products p ON p.id = si.product_id
     WHERE si.session_id = ?
     ORDER BY si.scanned_at`,
    [sessionId]
  );

  return { ...sessions[0], items };
}

// ─────────────────────────────────────────────────────────────
// POST /api/sessions          – start a new session
// ─────────────────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    // Abandon any existing active session for this user
    await pool.query(
      `UPDATE sessions SET status = 'abandoned'
       WHERE user_id = ? AND status IN ('active','paying')`,
      [req.user.id]
    );

    const sessionId = "SESS-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    await pool.query(
      "INSERT INTO sessions (id, user_id) VALUES (?, ?)",
      [sessionId, req.user.id]
    );

    const session = await getSessionFull(sessionId);
    res.status(201).json({ success: true, session });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/active    – get the caller's active session
// ─────────────────────────────────────────────────────────────
exports.getActive = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id FROM sessions WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1",
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No active session found" });
    }
    const session = await getSessionFull(rows[0].id);
    res.json({ success: true, session });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/:id       – get one session by ID
// ─────────────────────────────────────────────────────────────
exports.getById = async (req, res, next) => {
  try {
    const session = await getSessionFull(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    // Shoppers can only see their own sessions
    if (req.user.role !== "admin" && session.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    res.json({ success: true, session });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/sessions/:id/scan  – scan a product into the cart
// Body: { barcode } or { product_id }
// ─────────────────────────────────────────────────────────────
exports.scanItem = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { barcode, product_id } = req.body;

    // Resolve product
    let productRows;
    if (barcode) {
      [productRows] = await conn.query("SELECT * FROM products WHERE barcode = ?", [barcode]);
    } else {
      [productRows] = await conn.query("SELECT * FROM products WHERE id = ?", [product_id]);
    }
    if (productRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const product = productRows[0];

    // Validate session belongs to caller and is still active
    const [sessRows] = await conn.query(
      "SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = 'active'",
      [req.params.id, req.user.id]
    );
    if (sessRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Active session not found" });
    }

    // Upsert session_items: if already in cart, increment quantity
    await conn.query(
      `INSERT INTO session_items (session_id, product_id, quantity, unit_price, subtotal)
       VALUES (?, ?, 1, ?, ?)
       ON DUPLICATE KEY UPDATE
         quantity = quantity + 1,
         subtotal = (quantity + 1) * unit_price`,
      [req.params.id, product.id, product.price_rwf, product.price_rwf]
    );

    // Recalculate session totals
    const totals = await recalcSession(conn, req.params.id);

    // Price-mismatch alert: if scanned price differs from shelf (demo: P002 = Milk)
    if (product.id === "P002") {
      const shelfPrice = 800;
      if (product.price_rwf !== shelfPrice) {
        await conn.query(
          `INSERT INTO price_alerts
             (session_id, product_id, alert_type, expected_price, scanned_price, message)
           VALUES (?, ?, 'price_mismatch', ?, ?, ?)`,
          [req.params.id, product.id, shelfPrice, product.price_rwf,
           `Price mismatch on ${product.name}: shelf ${shelfPrice} RWF vs system ${product.price_rwf} RWF`]
        );
      }
    }

    // Age-restriction flag
    if (product.age_restricted) {
      await conn.query(
        `INSERT INTO price_alerts
           (session_id, product_id, alert_type, message)
         VALUES (?, ?, 'age_restricted', ?)`,
        [req.params.id, product.id,
         `Age-restricted item scanned: ${product.name} – ID verification required`]
      );
    }

    // Weight warning (>5 kg threshold)
    if (totals.total_weight_kg > 5) {
      const [existing] = await conn.query(
        `SELECT id FROM price_alerts
         WHERE session_id = ? AND alert_type = 'weight_exceeded'
           AND created_at > NOW() - INTERVAL 30 SECOND`,
        [req.params.id]
      );
      if (existing.length === 0) {
        await conn.query(
          `INSERT INTO price_alerts (session_id, alert_type, message)
           VALUES (?, 'weight_exceeded', ?)`,
          [req.params.id,
           `Cart weight ${totals.total_weight_kg.toFixed(2)} kg exceeds 5 kg – security check required at exit`]
        );
      }
    }

    await conn.commit();

    const session = await getSessionFull(req.params.id);
    res.json({ success: true, session, scanned_product: product });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/sessions/:id/items/:productId  – update quantity
// Body: { quantity }  (0 = remove)
// ─────────────────────────────────────────────────────────────
exports.updateItem = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { quantity } = req.body;

    if (quantity <= 0) {
      await conn.query(
        "DELETE FROM session_items WHERE session_id = ? AND product_id = ?",
        [req.params.id, req.params.productId]
      );
    } else {
      const [rows] = await conn.query(
        "SELECT unit_price FROM session_items WHERE session_id = ? AND product_id = ?",
        [req.params.id, req.params.productId]
      );
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: "Item not in cart" });
      }
      await conn.query(
        `UPDATE session_items SET quantity = ?, subtotal = ? * unit_price
         WHERE session_id = ? AND product_id = ?`,
        [quantity, quantity, req.params.id, req.params.productId]
      );
    }

    await recalcSession(conn, req.params.id);
    await conn.commit();

    const session = await getSessionFull(req.params.id);
    res.json({ success: true, session });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/sessions/:id/items/:productId  – remove item
// ─────────────────────────────────────────────────────────────
exports.removeItem = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "DELETE FROM session_items WHERE session_id = ? AND product_id = ?",
      [req.params.id, req.params.productId]
    );
    await recalcSession(conn, req.params.id);
    await conn.commit();
    const session = await getSessionFull(req.params.id);
    res.json({ success: true, session });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/sessions/:id/checkout  – pay and complete session
// Body: { payment_method, payment_phone }
// ─────────────────────────────────────────────────────────────
exports.checkout = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { payment_method, payment_phone } = req.body;

    const [sessRows] = await conn.query(
      "SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = 'active'",
      [req.params.id, req.user.id]
    );
    if (sessRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Active session not found" });
    }

    const txnId = "TXN-" + crypto.randomBytes(5).toString("hex").toUpperCase();
    const qrToken = crypto.randomBytes(16).toString("hex").toUpperCase();

    await conn.query(
      `UPDATE sessions
       SET status = 'completed', completed_at = NOW(),
           payment_method = ?, payment_phone = ?,
           txn_id = ?, qr_code_token = ?
       WHERE id = ?`,
      [payment_method, payment_phone || null, txnId, qrToken, req.params.id]
    );

    // Audit
    await conn.query(
      "INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, ip_address) VALUES (?,?,?,?,?,?)",
      [req.user.id, "payment", "session", req.params.id,
       JSON.stringify({ txnId, payment_method, total: sessRows[0].total_rwf }), req.ip]
    );

    await conn.commit();

    const session = await getSessionFull(req.params.id);
    res.json({ success: true, session, txn_id: txnId, qr_token: qrToken });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/verify-qr/:token  – security guard exit check
// ─────────────────────────────────────────────────────────────
exports.verifyQR = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, u.full_name, u.phone
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.qr_code_token = ? AND s.status = 'completed'`,
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false, valid: false, message: "Invalid or already-used QR token"
      });
    }
    const session = await getSessionFull(rows[0].id);
    res.json({ success: true, valid: true, session });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/history   – shopper's own past sessions
// ─────────────────────────────────────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const [sessions] = await pool.query(
      `SELECT id, status, started_at, completed_at,
              total_rwf, total_items, total_weight_kg,
              payment_method, txn_id
       FROM sessions
       WHERE user_id = ? AND status = 'completed'
       ORDER BY completed_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );
    res.json({ success: true, sessions });
  } catch (err) {
    next(err);
  }
};
