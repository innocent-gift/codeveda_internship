// config/db.js
// MySQL connection pool – shared across the entire app

const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "scangoo",
  waitForConnections: true,
  connectionLimit: 10,       // max concurrent connections
  queueLimit: 0,
  timezone: "+00:00",        // store all datetimes in UTC
  charset: "utf8mb4",
});

// Quick connectivity test – called once at startup
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("[DB] MySQL connected successfully");
    conn.release();
  } catch (err) {
    console.error("[DB] MySQL connection failed:", err.message);
    process.exit(1);          // crash loudly so the process manager restarts
  }
}

module.exports = { pool, testConnection };
