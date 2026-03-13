// db/init.js
// Run once with:  node db/init.js
// Creates all tables and seeds the default admin + demo shopper.

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

async function init() {
  // Connect without selecting a database first so we can CREATE it
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  console.log("[INIT] Connected to MySQL");

  // Run the full schema (CREATE DATABASE … CREATE TABLE … INSERT IGNORE …)
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await conn.query(schema);
  console.log("[INIT] Schema applied");

  // Seed admin user
  const adminPhone = process.env.ADMIN_PHONE || "+250788000001";
  const [adminRows] = await conn.query(
    "SELECT id FROM users WHERE phone = ?",
    [adminPhone]
  );
  if (adminRows.length === 0) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin123", 10);
    await conn.query(
      "INSERT INTO users (id, phone, full_name, password_hash, role) VALUES (?,?,?,?,'admin')",
      [uuidv4(), adminPhone, process.env.ADMIN_NAME || "Admin Inzovu", hash]
    );
    console.log("[INIT] Admin user created:", adminPhone);
  } else {
    console.log("[INIT] Admin user already exists – skipped");
  }

  // Seed demo shopper
  const demoPhone = process.env.DEMO_PHONE || "+250788123456";
  const [demoRows] = await conn.query(
    "SELECT id FROM users WHERE phone = ?",
    [demoPhone]
  );
  if (demoRows.length === 0) {
    const hash = await bcrypt.hash(process.env.DEMO_PASSWORD || "password123", 10);
    await conn.query(
      "INSERT INTO users (id, phone, full_name, password_hash, role) VALUES (?,?,?,?,'shopper')",
      [uuidv4(), demoPhone, process.env.DEMO_NAME || "Amahoro Jean", hash]
    );
    console.log("[INIT] Demo shopper created:", demoPhone);
  } else {
    console.log("[INIT] Demo shopper already exists – skipped");
  }

  await conn.end();
  console.log("[INIT] ✅ Database initialisation complete");
}

init().catch((err) => {
  console.error("[INIT] Failed:", err.message);
  process.exit(1);
});
