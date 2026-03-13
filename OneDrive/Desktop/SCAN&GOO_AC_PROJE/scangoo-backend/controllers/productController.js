// controllers/productController.js
// CRUD operations on the products table.

const { pool } = require("../config/db");

// ─────────────────────────────────────────────────────────────
// GET /api/products          – list all in-stock products
// GET /api/products?category=Food  – filter by category
// ─────────────────────────────────────────────────────────────
exports.getAll = async (req, res, next) => {
  try {
    const { category } = req.query;
    let sql = "SELECT * FROM products WHERE in_stock = 1";
    const params = [];
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    sql += " ORDER BY category, name";
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, products: rows });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/products/:id       – get one product by ID
// ─────────────────────────────────────────────────────────────
exports.getById = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM products WHERE id = ?", [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, product: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/products/barcode/:barcode  – scan lookup
// ─────────────────────────────────────────────────────────────
exports.getByBarcode = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM products WHERE barcode = ?", [req.params.barcode]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Barcode not recognised" });
    }
    res.json({ success: true, product: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/products          – create product  [admin]
// ─────────────────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const { id, name, emoji, price_rwf, weight_kg, barcode, age_restricted, category } = req.body;
    await pool.query(
      `INSERT INTO products (id, name, emoji, price_rwf, weight_kg, barcode, age_restricted, category)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, name, emoji || "📦", price_rwf, weight_kg || 0, barcode, age_restricted ? 1 : 0, category || "General"]
    );

    // Audit
    await pool.query(
      "INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, ip_address) VALUES (?,?,?,?,?,?)",
      [req.user.id, "product_create", "product", id, JSON.stringify({ name, price_rwf }), req.ip]
    );

    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [id]);
    res.status(201).json({ success: true, product: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/products/:id       – update product  [admin]
// ─────────────────────────────────────────────────────────────
exports.update = async (req, res, next) => {
  try {
    const allowed = ["name", "emoji", "price_rwf", "weight_kg", "barcode", "age_restricted", "category", "in_stock"];
    const fields = [];
    const values = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: "No updatable fields provided" });
    }
    values.push(req.params.id);

    const [result] = await pool.query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    await pool.query(
      "INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, ip_address) VALUES (?,?,?,?,?,?)",
      [req.user.id, "product_update", "product", req.params.id, JSON.stringify(req.body), req.ip]
    );

    const [rows] = await pool.query("SELECT * FROM products WHERE id = ?", [req.params.id]);
    res.json({ success: true, product: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/products/:id    – soft-delete (in_stock=0) [admin]
// ─────────────────────────────────────────────────────────────
exports.remove = async (req, res, next) => {
  try {
    const [result] = await pool.query(
      "UPDATE products SET in_stock = 0 WHERE id = ?", [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    await pool.query(
      "INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, ip_address) VALUES (?,?,?,?,?,?)",
      [req.user.id, "product_delete", "product", req.params.id, JSON.stringify({}), req.ip]
    );
    res.json({ success: true, message: "Product removed from catalog" });
  } catch (err) {
    next(err);
  }
};
