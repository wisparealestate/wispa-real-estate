import express from "express";
import pkg from "pg";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import { addPropertyWithPhotos } from "./property.js";
import upload from "./upload.js";
import path from "path";

import express from "express";
import pkg from "pg";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import { addPropertyWithPhotos } from "./property.js";
import upload from "./upload.js";
import path from "path";

const { Pool } = pkg;
const app = express();
app.use(cors({
  origin: "https://wispa-real-estate-one.vercel.app"
}));
app.use(bodyParser.json());
const port = process.env.PORT || 3001;
// Serve uploaded images statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
// Profile image upload endpoint
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Return the public URL to the uploaded image
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});
// Update user's avatar_url after image upload
app.post('/api/update-avatar-url', async (req, res) => {
  const { userId, avatarUrl } = req.body;
  if (!userId || !avatarUrl) {
    return res.status(400).json({ error: 'Missing userId or avatarUrl' });
  }
  try {
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// PostgreSQL connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// CORS test endpoint (must be after app and CORS middleware)
app.get("/cors-test", (req, res) => {
  res.json({ message: "CORS is working!", origin: req.headers.origin || null });
});

// Get all user messages for admin chat
app.get("/api/admin/messages", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM messages ORDER BY sent_at DESC");
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Property upload endpoint
app.post("/api/properties", async (req, res) => {
  const { property, photoUrls } = req.body;
  if (!property || !photoUrls || !Array.isArray(photoUrls)) {
    return res.status(400).json({ error: "Missing property or photo URLs" });
  }
  try {
    const propertyId = await addPropertyWithPhotos(property, photoUrls);
    res.json({ propertyId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User signup
app.post("/api/signup", async (req, res) => {
  const { username, email, password, full_name } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email, full_name, role, created_at",
      [username, email, hash, full_name || null]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    // Accept either username or email
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1",
      [username]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role, created_at: user.created_at } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin login
app.post("/api/admin-login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    // Accept either username or email
    const result = await pool.query(
      "SELECT * FROM admin_logins WHERE username = $1 OR email = $1",
      [username]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    const admin = result.rows[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ admin: { id: admin.id, username: admin.username, email: admin.email, created_at: admin.created_at } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("Wispa Real Estate Backend is running!");
});

// Example: Test DB connection
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as now");
    res.json({ time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
