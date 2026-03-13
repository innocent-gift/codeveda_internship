// routes/admin.js
const express = require("express");
const router = express.Router();

const {
  getLiveSessions, getDashboard, getCompletedSessions,
  getAlerts, resolveAlert, getInventory, getUsers, getAuditLog,
} = require("../controllers/adminController");
const { authenticate, requireAdmin } = require("../middleware/auth");

// All admin routes require a valid JWT AND admin role
router.use(authenticate, requireAdmin);

/**
 * @route  GET /api/admin/dashboard
 * @desc   KPI snapshot: active shoppers, live cart value, today's revenue, alerts
 */
router.get("/dashboard", getDashboard);

/**
 * @route  GET /api/admin/live-sessions
 * @desc   All active sessions with full cart contents (real-time monitor)
 */
router.get("/live-sessions", getLiveSessions);

/**
 * @route  GET /api/admin/completed-sessions?date=YYYY-MM-DD
 * @desc   All completed sessions for a given date (default: today)
 */
router.get("/completed-sessions", getCompletedSessions);

/**
 * @route  GET /api/admin/alerts?resolved=0
 * @desc   Price mismatch / age-restriction / weight alerts
 */
router.get("/alerts", getAlerts);

/**
 * @route  PATCH /api/admin/alerts/:id/resolve
 * @desc   Mark an alert as resolved
 */
router.patch("/alerts/:id/resolve", resolveAlert);

/**
 * @route  GET /api/admin/inventory
 * @desc   Units sold + revenue per product across all sessions
 */
router.get("/inventory", getInventory);

/**
 * @route  GET /api/admin/users
 * @desc   All registered users with session counts and lifetime spend
 */
router.get("/users", getUsers);

/**
 * @route  GET /api/admin/audit-log?limit=50&offset=0
 * @desc   Full audit trail (Rwanda data compliance)
 */
router.get("/audit-log", getAuditLog);

module.exports = router;
