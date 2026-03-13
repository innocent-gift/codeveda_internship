// routes/auth.js
const express = require("express");
const { body } = require("express-validator");
const router = express.Router();

const { register, login, getMe } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// Validation rules
const registerRules = [
  body("phone").notEmpty().withMessage("Phone is required"),
  body("full_name").notEmpty().withMessage("Full name is required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
];
const loginRules = [
  body("phone").notEmpty().withMessage("Phone is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

/**
 * @route  POST /api/auth/register
 * @desc   Register a new shopper
 * @access Public
 */
router.post("/register", registerRules, register);

/**
 * @route  POST /api/auth/login
 * @desc   Login (shopper or admin)
 * @access Public
 */
router.post("/login", loginRules, login);

/**
 * @route  GET /api/auth/me
 * @desc   Get current logged-in user profile
 * @access Private
 */
router.get("/me", authenticate, getMe);

module.exports = router;
