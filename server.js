require("dotenv").config();

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "codealpha_store",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function createToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET || "dev_secret_change_me",
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Please log in first." });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "dev_secret_change_me");
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}

app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, category, description, price, image_url AS image, stock FROM products ORDER BY id DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load products." });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, category, description, price, image_url AS image, stock FROM products WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Product not found." });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load product." });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: "Enter a name, valid email and password of at least 6 characters." });
  }

  try {
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email.toLowerCase()]);
    if (existing.length) return res.status(409).json({ message: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.trim(), email.toLowerCase().trim(), passwordHash]
    );

    const user = { id: result.insertId, name: name.trim(), email: email.toLowerCase().trim() };
    res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email?.toLowerCase().trim()]);
    if (!rows.length) return res.status(401).json({ message: "Invalid email or password." });

    const user = rows[0];
    const valid = await bcrypt.compare(password || "", user.password_hash);
    if (!valid) return res.status(401).json({ message: "Invalid email or password." });

    const safeUser = { id: user.id, name: user.name, email: user.email };
    res.json({ user: safeUser, token: createToken(safeUser) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed." });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/orders", auth, async (req, res) => {
  const { customerName, email, address, city, pincode, items } = req.body;

  if (!customerName || !email || !address || !city || !pincode || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: "Please complete checkout details and add at least one product." });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let total = 0;
    const verifiedItems = [];

    for (const item of items) {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const [rows] = await connection.query("SELECT id, name, price, stock FROM products WHERE id = ? FOR UPDATE", [item.productId]);

      if (!rows.length) throw new Error(`Product ${item.productId} was not found.`);
      const product = rows[0];

      if (product.stock < quantity) {
        throw new Error(`${product.name} does not have enough stock.`);
      }

      total += Number(product.price) * quantity;
      verifiedItems.push({ productId: product.id, quantity, price: Number(product.price) });
    }

    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (user_id, customer_name, email, address, city, pincode, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Placed')`,
      [req.user.id, customerName, email, address, city, pincode, total]
    );

    for (const item of verifiedItems) {
      await connection.query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [orderResult.insertId, item.productId, item.quantity, item.price]
      );
      await connection.query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [item.quantity, item.productId]
      );
    }

    await connection.commit();

    res.status(201).json({
      message: "Order placed successfully.",
      orderId: orderResult.insertId,
      total
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(400).json({ message: error.message || "Could not place order." });
  } finally {
    connection.release();
  }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT id, total_amount AS total, status, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Could not load orders." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`CodeAlpha Store running at http://localhost:${PORT}`);
});