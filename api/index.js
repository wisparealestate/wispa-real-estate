
import express from "express";
import pkg from "pg";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import { addPropertyWithPhotos } from "./property.js";
import upload from "./upload.js";
import path from "path";
import fs from 'fs/promises';

const { Pool } = pkg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const app = express();
app.use(cors({
  origin: "https://wispa-real-estate-one.vercel.app"
}));
// Allow larger JSON payloads (but prefer file uploads for images)
app.use(bodyParser.json({ limit: '10mb' }));
const port = process.env.PORT || 3001;
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const dataDir = path.join(process.cwd(), 'data');
async function ensureDataDir(){
  try{ await fs.mkdir(dataDir, { recursive: true }); }catch(e){}
}
async function readJson(name){
  try{
    await ensureDataDir();
    const p = path.join(dataDir, name);
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw || '[]');
  }catch(e){ return []; }
}
async function writeJson(name, data){
  await ensureDataDir();
  const p = path.join(dataDir, name);
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}
// Get notifications for a user (real DB)
app.get("/api/notifications", async (req, res) => {
  const userId = req.query.userId;
  try {
    // Try DB first, fallback to file storage. If userId is missing, return all notifications.
    try {
      const result = userId
        ? await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId])
        : await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
      return res.json({ notifications: result.rows });
    } catch (err) {
      const all = await readJson('notifications.json');
      const filtered = userId ? all.filter(n => String(n.userId) === String(userId)) : all;
      return res.json({ notifications: filtered });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get conversations for a user (real DB)
app.get("/api/conversations", async (req, res) => {
  const userId = req.query.userId;
  try {
    // DB-first, fallback to file. Return all if userId not provided.
    try {
      const result = userId
        ? await pool.query('SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated DESC', [userId])
        : await pool.query('SELECT * FROM conversations ORDER BY updated DESC');
      return res.json({ conversations: result.rows });
    } catch (err) {
      const all = await readJson('conversations.json');
      const filtered = userId ? all.filter(c => String(c.userId) === String(userId)) : all;
      return res.json({ conversations: filtered });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// File-backed admin endpoints (notifications/chat/sent-notifs/profile/requests/contacts/reactions/alerts)
app.get('/api/admin/sent-notifications', async (req, res) => {
  const arr = await readJson('adminSentNotifications.json');
  res.json({ sent: arr });
});
app.post('/api/admin/sent-notifications', async (req, res) => {
  const note = req.body;
  const arr = await readJson('adminSentNotifications.json');
  arr.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, note));
  await writeJson('adminSentNotifications.json', arr);
  res.json({ success: true });
});

app.get('/api/admin/profile', async (req, res) => {
  const p = await readJson('adminProfile.json');
  res.json({ profile: p[0] || {} });
});
app.post('/api/admin/profile', async (req, res) => {
  const profile = req.body;
  await writeJson('adminProfile.json', [profile]);
  res.json({ success: true });
});

app.get('/api/property-requests', async (req, res) => {
  const arr = await readJson('propertyRequests.json');
  res.json({ requests: arr });
});
app.post('/api/property-requests', async (req, res) => {
  const obj = req.body;
  const arr = await readJson('propertyRequests.json');
  arr.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, obj));
  await writeJson('propertyRequests.json', arr);
  res.json({ success: true });
});

app.get('/api/contact-messages', async (req, res) => {
  const arr = await readJson('contactMessages.json');
  res.json({ contacts: arr });
});
app.post('/api/contact-messages', async (req, res) => {
  const obj = req.body;
  const arr = await readJson('contactMessages.json');
  arr.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, obj));
  await writeJson('contactMessages.json', arr);
  res.json({ success: true });
});

app.get('/api/notification-reactions', async (req, res) => {
  const arr = await readJson('notificationReactions.json');
  res.json({ reactions: arr });
});
app.post('/api/notification-reactions', async (req, res) => {
  const obj = req.body;
  const arr = await readJson('notificationReactions.json');
  arr.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, obj));
  await writeJson('notificationReactions.json', arr);
  res.json({ success: true });
});

app.get('/api/system-alerts', async (req, res) => {
  const arr = await readJson('systemAlerts.json');
  res.json({ alerts: arr });
});
app.post('/api/system-alerts', async (req, res) => {
  const obj = req.body;
  const arr = await readJson('systemAlerts.json');
  arr.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, obj));
  await writeJson('systemAlerts.json', arr);
  res.json({ success: true });
});

// Generic admin sync endpoint to overwrite a named file
app.post('/api/admin/sync', async (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Missing key' });
  const mapping = {
    'adminSentNotifications': 'adminSentNotifications.json',
    'adminProfile': 'adminProfile.json',
    'propertyRequests': 'propertyRequests.json',
    'contactMessages': 'contactMessages.json',
    'notificationReactions': 'notificationReactions.json',
    'systemAlerts': 'systemAlerts.json',
    'notifications': 'notifications.json',
    'conversations': 'conversations.json'
  };
  // Allow writing arbitrary safe keys to disk as fallback (useful for admin UI)
  let file = mapping[key];
  if (!file) {
    // sanitize key to a filename (allow letters, numbers, dash, underscore)
    const safe = String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
    file = safe + '.json';
  }
  try {
    await writeJson(file, value || []);
    res.json({ success: true, file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// Upload multiple files for property photos
app.post('/api/upload-photos', upload.array('files'), (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    const urls = req.files.map(f => `${req.protocol}://${req.get('host')}/uploads/${f.filename}`);
    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a notification for a user (DB first, fallback to file)
app.post('/api/notifications', async (req, res) => {
  const { userId, notification } = req.body || {};
  if (!userId || !notification) return res.status(400).json({ error: 'Missing userId or notification' });
  try {
    try {
      const result = await pool.query(
        'INSERT INTO notifications (user_id, title, body, data, created_at, read) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [userId, notification.title || null, notification.message || notification.fullMessage || null, JSON.stringify(notification || {}), notification.timestamp || new Date().toISOString(), notification.read ? true : false]
      );
      return res.json({ notification: result.rows[0] });
    } catch (e) {
      const all = await readJson('notifications.json');
      all.unshift(Object.assign({ userId: userId }, notification));
      await writeJson('notifications.json', all);
      return res.json({ notification: notification });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Append a message to a conversation (DB first, fallback to file)
app.post('/api/conversations/messages', async (req, res) => {
  const { convId, message } = req.body || {};
  if (!convId || !message) return res.status(400).json({ error: 'Missing convId or message' });
  try {
    try {
      const result = await pool.query(
        'INSERT INTO messages (conversation_id, sender, body, meta, sent_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [convId, message.sender || null, message.text || message.body || null, JSON.stringify(message || {}), message.ts ? new Date(message.ts).toISOString() : new Date().toISOString()]
      );
      return res.json({ message: result.rows[0] });
    } catch (e) {
      const all = await readJson('conversations.json');
      let conv = all.find(c => c.id === convId);
      if (!conv) {
        conv = { id: convId, messages: [] };
        all.push(conv);
      }
      conv.messages = conv.messages || [];
      conv.messages.push(message);
      conv.updated = Date.now();
      await writeJson('conversations.json', all);
      return res.json({ message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user's avatar_url after image upload
app.post('/api/update-avatar-url', async (req, res) => {
  const { userId, avatarUrl } = req.body;
  if (!userId || !avatarUrl) return res.status(400).json({ error: 'Missing userId or avatarUrl' });
  try {
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CORS test endpoint (must be after app and CORS middleware)
app.get('/cors-test', (req, res) => {
  res.json({ message: 'CORS is working!', origin: req.headers.origin || null });
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
  // Accept multiple client shapes: { property, photoUrls },
  // { property, photos }, { property, images }, or a top-level property object
  const body = req.body || {};
  console.debug('/api/properties received body:', body);
  let property = body.property || null;
  let photoUrls = body.photoUrls || body.photos || body.images || null;

  // If client sent top-level fields (title, price, etc.) treat body as property
  if (!property && (body.title || body.price || body.address || body.city)) {
    property = body;
    // try to extract photos from common keys
    photoUrls = photoUrls || body.photoUrls || body.photos || body.images || [];
  }

  // Ensure photoUrls is an array (default to empty array)
  if (!Array.isArray(photoUrls)) photoUrls = [];
  // Normalize photo entries: accept objects like {src: 'data:...'} or {url: '...'}
  photoUrls = photoUrls.map(p => (p && typeof p === 'object') ? (p.src || p.url || p.photo || p.image || '') : p).filter(Boolean);

  // Also accept property.images which may be an array of objects
  if ((!photoUrls || photoUrls.length === 0) && property && Array.isArray(property.images)){
    const imgs = property.images.map(p => (p && typeof p === 'object') ? (p.src || p.url || p.photo || p.image || '') : p).filter(Boolean);
    if (imgs.length) photoUrls = imgs;
  }

  if (!property || typeof property !== 'object') {
    // Try to parse if property is a JSON string
    if (property && typeof property === 'string') {
      try { property = JSON.parse(property); } catch(e){}
    }
    if (!property || typeof property !== 'object') {
      console.warn('/api/properties bad payload, received:', body);
      return res.status(400).json({ error: 'Missing or invalid property object', received: body });
    }
  }

  try {
    const resObj = await addPropertyWithPhotos(property, photoUrls);
    // resObj contains { property, propertyId }
    if (resObj && resObj.property) return res.json({ property: resObj.property, propertyId: resObj.propertyId });
    if (resObj && resObj.propertyId) return res.json({ propertyId: resObj.propertyId });
    return res.json({ propertyId: resObj });
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


// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, email, full_name, role, created_at, avatar_url FROM users ORDER BY created_at DESC");
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all properties
app.get("/api/properties", async (req, res) => {
  try {
    try {
      const result = await pool.query("SELECT * FROM properties ORDER BY created_at DESC");
      return res.json({ properties: result.rows });
    } catch (e) {
      // Fallback to file-backed properties
      const all = await readJson('properties.json');
      return res.json({ properties: all });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 

// Delete a property by id (DB-first, fallback to file)
app.delete('/api/properties/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    try {
      // Delete photos first (cascade may handle it depending on schema)
      await pool.query('DELETE FROM property_photos WHERE property_id = $1', [id]);
      const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true, deleted: result.rows[0] });
    } catch (e) {
      // Fallback to file-based store
      const all = await readJson('properties.json');
      const filtered = all.filter(p => String(p.id) !== String(id));
      await writeJson('properties.json', filtered);
      return res.json({ success: true });
    }
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
