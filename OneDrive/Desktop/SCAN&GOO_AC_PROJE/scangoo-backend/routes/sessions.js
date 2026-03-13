// routes/sessions.js
const express = require("express");
const router = express.Router();

const {
  create, getActive, getById,
  scanItem, updateItem, removeItem,
  checkout, verifyQR, getHistory,
} = require("../controllers/sessionController");
const { authenticate } = require("../middleware/auth");

/**
 * @route  POST /api/sessions
 * @desc   Start a new shopping session
 * @access Private (shopper)
 */
router.post("/", authenticate, create);

/**
 * @route  GET /api/sessions/history
 * @desc   Get the caller's completed session history
 * @access Private (shopper)
 */
router.get("/history", authenticate, getHistory);

/**
 * @route  GET /api/sessions/active
 * @desc   Get the caller's current active session
 * @access Private (shopper)
 */
router.get("/active", authenticate, getActive);

/**
 * @route  GET /api/sessions/verify-qr/:token
 * @desc   Security guard exit verification – check QR token
 * @access Private (any authenticated – guard uses a read-only token)
 */
router.get("/verify-qr/:token", authenticate, verifyQR);

/**
 * @route  GET /api/sessions/:id
 * @desc   Get full session details with cart items
 * @access Private (owner or admin)
 */
router.get("/:id", authenticate, getById);

/**
 * @route  POST /api/sessions/:id/scan
 * @desc   Scan a product into the cart  { barcode } or { product_id }
 * @access Private (session owner)
 */
router.post("/:id/scan", authenticate, scanItem);

/**
 * @route  PATCH /api/sessions/:id/items/:productId
 * @desc   Change quantity of a cart item  { quantity }  (0 = remove)
 * @access Private (session owner)
 */
router.patch("/:id/items/:productId", authenticate, updateItem);

/**
 * @route  DELETE /api/sessions/:id/items/:productId
 * @desc   Remove an item from the cart entirely
 * @access Private (session owner)
 */
router.delete("/:id/items/:productId", authenticate, removeItem);

/**
 * @route  POST /api/sessions/:id/checkout
 * @desc   Complete payment and close session
 *         Body: { payment_method, payment_phone }
 * @access Private (session owner)
 */
router.post("/:id/checkout", authenticate, checkout);

module.exports = router;
