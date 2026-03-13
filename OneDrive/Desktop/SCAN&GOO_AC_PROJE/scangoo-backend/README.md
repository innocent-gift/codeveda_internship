# SCAN&GOO – Backend API

**Node.js + Express + MySQL**  
Prepared by: Nkurunziza Innocent · African Leadership University

---

## Project Structure

```
scangoo-backend/
├── server.js                  # Express app entry point
├── package.json
├── .env.example               # Copy to .env and fill in values
│
├── config/
│   └── db.js                  # MySQL connection pool (mysql2)
│
├── db/
│   ├── schema.sql             # All CREATE TABLE + seed statements
│   └── init.js                # Run once: applies schema + seeds users
│
├── middleware/
│   ├── auth.js                # JWT verify + requireAdmin guard
│   └── errorHandler.js        # Global Express error handler
│
├── controllers/
│   ├── authController.js      # register, login, getMe
│   ├── productController.js   # CRUD products
│   ├── sessionController.js   # Shopping cart + checkout + QR verify
│   └── adminController.js     # Live monitor, analytics, alerts
│
└── routes/
    ├── auth.js
    ├── products.js
    ├── sessions.js
    └── admin.js
```

---

## Database Schema (5 tables)

| Table | Purpose |
|---|---|
| `users` | Shoppers and admin accounts |
| `products` | Product catalog (name, price, barcode, weight) |
| `sessions` | One row per shopping trip |
| `session_items` | Cart line items – one row per product per session |
| `price_alerts` | Price mismatches, age-restriction flags, weight warnings |
| `audit_log` | Every sensitive action (Rwanda Data Law compliance) |

---

## Setup

### 1. Prerequisites
- Node.js ≥ 18
- MySQL ≥ 8.0

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env – set DB_HOST, DB_USER, DB_PASSWORD, JWT_SECRET
```

### 4. Initialise the database
```bash
node db/init.js
```
This creates the `scangoo` database, all tables, and seeds:
- Admin account: `+250788000001` / `admin123`
- Demo shopper: `+250788123456` / `password123`

### 5. Start the server
```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Server runs on **http://localhost:3000**

---

## API Reference

All protected routes require:
```
Authorization: Bearer <jwt_token>
```

---

### AUTH

#### `POST /api/auth/register`
Register a new shopper account.
```json
// Request body
{
  "phone": "+250788999888",
  "full_name": "Kalisa Eric",
  "password": "mypassword"
}

// Response 201
{
  "success": true,
  "token": "<jwt>",
  "user": { "id": "...", "phone": "+250788999888", "full_name": "Kalisa Eric", "role": "shopper" }
}
```

#### `POST /api/auth/login`
```json
// Request body
{ "phone": "+250788123456", "password": "password123" }

// Response 200
{ "success": true, "token": "<jwt>", "user": { ... } }
```

#### `GET /api/auth/me` 🔒
Returns the authenticated user's profile.

---

### PRODUCTS

#### `GET /api/products` 🔒
List all in-stock products. Optional: `?category=Food`

#### `GET /api/products/barcode/:barcode` 🔒
Look up a product by barcode (used by the scanner screen).
```
GET /api/products/barcode/6001254001234
```

#### `GET /api/products/:id` 🔒

#### `POST /api/products` 🔒 Admin
```json
{
  "id": "P009",
  "name": "Yoghurt 250ml",
  "emoji": "🥛",
  "price_rwf": 650,
  "weight_kg": 0.25,
  "barcode": "6001254009012",
  "age_restricted": false,
  "category": "Dairy"
}
```

#### `PUT /api/products/:id` 🔒 Admin
Partial updates — send only the fields you want to change.

#### `DELETE /api/products/:id` 🔒 Admin
Soft-delete: sets `in_stock = 0`.

---

### SESSIONS (Shopping Cart)

#### `POST /api/sessions` 🔒
Start a new session. Any previous active session for this user is abandoned.
```json
// Response 201
{
  "success": true,
  "session": {
    "id": "SESS-A1B2C3D4",
    "user_id": "...",
    "status": "active",
    "total_rwf": 0,
    "total_items": 0,
    "total_weight_kg": 0,
    "items": []
  }
}
```

#### `GET /api/sessions/active` 🔒
Get the caller's currently active session with all cart items.

#### `GET /api/sessions/:id` 🔒
Get a specific session. Shoppers can only view their own sessions.

#### `POST /api/sessions/:id/scan` 🔒
Add/increment a product in the cart. Send either `barcode` OR `product_id`.
```json
// Request body
{ "barcode": "6001254001234" }
// OR
{ "product_id": "P001" }

// Response – full updated session returned
{
  "success": true,
  "session": { ... "items": [ { "product_id": "P001", "quantity": 1, "subtotal": 350, ... } ] },
  "scanned_product": { "id": "P001", "name": "Indomie Noodles", ... }
}
```
This endpoint also automatically:
- Triggers a `price_mismatch` alert if the system price differs from the shelf price
- Triggers an `age_restricted` alert for 18+ products
- Triggers a `weight_exceeded` alert if the cart exceeds 5 kg

#### `PATCH /api/sessions/:id/items/:productId` 🔒
Update quantity. Send `{ "quantity": 0 }` to remove.
```json
{ "quantity": 3 }
```

#### `DELETE /api/sessions/:id/items/:productId` 🔒
Remove item completely from cart.

#### `POST /api/sessions/:id/checkout` 🔒
Complete payment and close the session.
```json
// Request body
{
  "payment_method": "momo",       // "momo" | "airtel" | "cash"
  "payment_phone": "+250788123456"
}

// Response 200
{
  "success": true,
  "txn_id": "TXN-AB12CD34EF",
  "qr_token": "4F9A2B...",        // encode this into the exit QR code
  "session": { ... }
}
```

#### `GET /api/sessions/verify-qr/:token` 🔒
Security guard exit check — validate the QR token.
```json
// Valid receipt
{ "success": true, "valid": true, "session": { "total_rwf": 2650, "items": [...] } }

// Invalid / tampered
{ "success": false, "valid": false, "message": "Invalid or already-used QR token" }
```

#### `GET /api/sessions/history` 🔒
Shopper's completed session history. Params: `?limit=10&offset=0`

---

### ADMIN 🔒 Admin only

#### `GET /api/admin/dashboard`
KPI snapshot:
```json
{
  "dashboard": {
    "active_shoppers": 5,
    "live_items": 23,
    "live_value": 34500,
    "completed_today": 147,
    "revenue_today": 1240000,
    "open_alerts": 3,
    "top_products": [...]
  }
}
```

#### `GET /api/admin/live-sessions`
All active sessions with **full cart contents** — the real-time monitor.
```json
{
  "count": 5,
  "sessions": [
    {
      "id": "SESS-A1B2C3D4",
      "full_name": "Kalisa Eric",
      "phone": "+250788111222",
      "status": "active",
      "total_rwf": 4150,
      "total_items": 6,
      "total_weight_kg": 2.075,
      "items": [
        { "name": "Milk 1L", "emoji": "🥛", "quantity": 2, "subtotal": 1600 },
        { "name": "Indomie Noodles", "emoji": "🍜", "quantity": 4, "subtotal": 1400 }
      ]
    }
  ]
}
```

#### `GET /api/admin/completed-sessions?date=2026-01-20`
All completed sessions for a date with revenue summary.

#### `GET /api/admin/alerts?resolved=0`
Unresolved price mismatches, age-restriction flags, and weight warnings.

#### `PATCH /api/admin/alerts/:id/resolve`
Mark an alert as handled.

#### `GET /api/admin/inventory`
Units sold + revenue per product across all sessions.

#### `GET /api/admin/users`
All shoppers with session count and lifetime spend.

#### `GET /api/admin/audit-log?limit=50&offset=0`
Full compliance audit trail.

---

## Frontend Integration

In the frontend (`index_v2.html`), replace the in-memory state with API calls:

```javascript
const API = "http://localhost:3000/api";
let token = localStorage.getItem("token");

// Login
async function doLogin(phone, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password })
  });
  const data = await res.json();
  token = data.token;
  localStorage.setItem("token", token);
  return data.user;
}

// Start session
async function startSession() {
  const res = await fetch(`${API}/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  return (await res.json()).session;
}

// Scan product
async function scanProduct(sessionId, barcode) {
  const res = await fetch(`${API}/sessions/${sessionId}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ barcode })
  });
  return (await res.json()).session;
}

// Admin: live sessions (poll every 2s)
async function getLiveSessions() {
  const res = await fetch(`${API}/admin/live-sessions`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return (await res.json()).sessions;
}
```

---

## Author

**Nkurunziza Innocent**  
African Leadership University  
i.nkurunziz@alustudent.com  
SCAN&GOO v1.0 · January 2026
