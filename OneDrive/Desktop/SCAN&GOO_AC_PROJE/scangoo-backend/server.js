// server.js
// SCAN&GOO REST API – main entry point

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { testConnection } = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

// ── Route modules ─────────────────────────────────────────────
const authRoutes     = require("./routes/auth");
const productRoutes  = require("./routes/products");
const sessionRoutes  = require("./routes/sessions");
const adminRoutes    = require("./routes/admin");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Global middleware ─────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? ["https://scangoo.rw", "https://app.scangoo.rw"]
    : "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "SCAN&GOO API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/admin",    adminRoutes);

// ── 404 fallback ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────────
async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`\n🚀 SCAN&GOO API running on http://localhost:${PORT}`);
    console.log(`   Health : http://localhost:${PORT}/health`);
    console.log(`   Auth   : http://localhost:${PORT}/api/auth/login`);
    console.log(`   Admin  : http://localhost:${PORT}/api/admin/dashboard`);
    console.log(`   Env    : ${process.env.NODE_ENV || "development"}\n`);
  });
}

start();
