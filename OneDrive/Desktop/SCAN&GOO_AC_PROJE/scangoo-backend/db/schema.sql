-- ============================================================
--  SCAN&GOO  –  MySQL Database Schema  v1.0
--  Inzovu Supermarket · Kigali, Rwanda
--  Author: Nkurunziza Innocent (African Leadership University)
-- ============================================================

CREATE DATABASE IF NOT EXISTS scangoo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE scangoo;

-- ─────────────────────────────────────────────────────────────
-- USERS
-- Stores shoppers and admin accounts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)      NOT NULL,
  phone         VARCHAR(20)   NOT NULL,
  full_name     VARCHAR(100)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('shopper','admin') NOT NULL DEFAULT 'shopper',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login    DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- PRODUCTS
-- Master product catalog with pricing and metadata
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              VARCHAR(10)   NOT NULL,
  name            VARCHAR(150)  NOT NULL,
  emoji           VARCHAR(10)   NOT NULL DEFAULT '📦',
  price_rwf       INT UNSIGNED  NOT NULL COMMENT 'Price in Rwandan Francs',
  weight_kg       DECIMAL(6,3)  NOT NULL DEFAULT 0.000,
  barcode         VARCHAR(50)   NOT NULL,
  age_restricted  TINYINT(1)    NOT NULL DEFAULT 0,
  category        VARCHAR(50)   NOT NULL DEFAULT 'General',
  in_stock        TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_barcode (barcode),
  KEY idx_category (category),
  KEY idx_in_stock (in_stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- SESSIONS
-- Each shopping trip = one session
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id              VARCHAR(20)   NOT NULL,
  user_id         CHAR(36)      NOT NULL,
  status          ENUM('active','paying','completed','abandoned')
                  NOT NULL DEFAULT 'active',
  started_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME      NULL,
  total_rwf       INT UNSIGNED  NOT NULL DEFAULT 0,
  total_items     INT UNSIGNED  NOT NULL DEFAULT 0,
  total_weight_kg DECIMAL(8,3)  NOT NULL DEFAULT 0.000,
  payment_method  ENUM('momo','airtel','cash') NULL,
  payment_phone   VARCHAR(20)   NULL,
  txn_id          VARCHAR(50)   NULL COMMENT 'MoMo / Airtel transaction reference',
  qr_code_token   VARCHAR(100)  NULL COMMENT 'Token encoded in exit QR code',
  PRIMARY KEY (id),
  UNIQUE KEY uq_txn_id (txn_id),
  UNIQUE KEY uq_qr_token (qr_code_token),
  KEY idx_user_id (user_id),
  KEY idx_status (status),
  KEY idx_started_at (started_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- SESSION ITEMS
-- Line items inside a session (the cart)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_items (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  session_id  VARCHAR(20)   NOT NULL,
  product_id  VARCHAR(10)   NOT NULL,
  quantity    INT UNSIGNED  NOT NULL DEFAULT 1,
  unit_price  INT UNSIGNED  NOT NULL COMMENT 'Price snapshot at time of scan',
  subtotal    INT UNSIGNED  NOT NULL COMMENT 'quantity * unit_price',
  scanned_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_product (session_id, product_id),
  KEY idx_session_id (session_id),
  KEY idx_product_id (product_id),
  CONSTRAINT fk_item_session FOREIGN KEY (session_id)
    REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_product FOREIGN KEY (product_id)
    REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- PRICE ALERTS
-- Price mismatches, age-restriction triggers, weight warnings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_alerts (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  session_id      VARCHAR(20)   NULL,
  product_id      VARCHAR(10)   NULL,
  alert_type      ENUM('price_mismatch','age_restricted','weight_exceeded')
                  NOT NULL,
  expected_price  INT UNSIGNED  NULL,
  scanned_price   INT UNSIGNED  NULL,
  message         TEXT          NOT NULL,
  resolved        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alert_session (session_id),
  KEY idx_alert_resolved (resolved),
  CONSTRAINT fk_alert_session FOREIGN KEY (session_id)
    REFERENCES sessions(id) ON DELETE SET NULL,
  CONSTRAINT fk_alert_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- AUDIT LOG
-- Every sensitive action recorded for compliance (Rwanda Data Law)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     CHAR(36)      NULL,
  action      VARCHAR(50)   NOT NULL,
  entity_type VARCHAR(30)   NULL,
  entity_id   VARCHAR(50)   NULL,
  detail      JSON          NULL,
  ip_address  VARCHAR(45)   NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────
-- SEED: Products
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO products
  (id, name, emoji, price_rwf, weight_kg, barcode, age_restricted, category)
VALUES
  ('P001','Indomie Noodles',     '🍜', 350,  0.075, '6001254001234', 0, 'Food'),
  ('P002','Milk 1L',             '🥛', 800,  1.000, '6001254002345', 0, 'Dairy'),
  ('P003','Mineral Water 500ml', '💧', 300,  0.500, '6001254003456', 0, 'Beverages'),
  ('P004','Primus Beer 500ml',   '🍺', 1200, 0.500, '6001254004567', 1, 'Alcohol'),
  ('P005','Bread (White Loaf)',  '🍞', 1000, 0.400, '6001254005678', 0, 'Bakery'),
  ('P006','Cooking Oil 500ml',   '🫙', 2500, 0.500, '6001254006789', 0, 'Pantry'),
  ('P007','Sugar 1kg',           '🧂', 900,  1.000, '6001254007890', 0, 'Pantry'),
  ('P008','Eggs (Tray 12)',      '🥚', 2400, 0.700, '6001254008901', 0, 'Dairy');
