// routes/products.js
const express = require("express");
const router = express.Router();

const {
  getAll, getById, getByBarcode, create, update, remove,
} = require("../controllers/productController");
const { authenticate, requireAdmin } = require("../middleware/auth");

/**
 * @route  GET /api/products
 * @desc   List all in-stock products (optional ?category= filter)
 * @access Private (any authenticated user)
 */
router.get("/", authenticate, getAll);

/**
 * @route  GET /api/products/barcode/:barcode
 * @desc   Look up a product by its barcode (used by the scanner)
 * @access Private
 */
router.get("/barcode/:barcode", authenticate, getByBarcode);

/**
 * @route  GET /api/products/:id
 * @desc   Get one product by ID
 * @access Private
 */
router.get("/:id", authenticate, getById);

/**
 * @route  POST /api/products
 * @desc   Add a new product to the catalog
 * @access Admin only
 */
router.post("/", authenticate, requireAdmin, create);

/**
 * @route  PUT /api/products/:id
 * @desc   Update an existing product (name, price, stock, etc.)
 * @access Admin only
 */
router.put("/:id", authenticate, requireAdmin, update);

/**
 * @route  DELETE /api/products/:id
 * @desc   Soft-delete (marks in_stock = 0)
 * @access Admin only
 */
router.delete("/:id", authenticate, requireAdmin, remove);

module.exports = router;
