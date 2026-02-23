
import express from "express";
import pkg from "pg";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import upload from "./upload.js";
import path from "path";
import fs from 'fs/promises';
import crypto from 'crypto';

const { Pool } = pkg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Import property helper after pool is defined to avoid circular import issues
import { addPropertyWithPhotos } from "./property.js";

const app = express();
// Respect X-Forwarded-* headers from proxies (so req.protocol reflects original scheme)
app.set('trust proxy', true);
// Allow configured origin(s) and credentials for cross-site session cookies
// Support multiple origins via comma-separated `CORS_ORIGINS` env var or sensible defaults
const DEFAULT_CORS = (process.env.CORS_ORIGINS || 'https://wispa-real-estate-one.vercel.app,https://wispa-real-estate-2ew3.onrender.com,http://localhost:3000,http://localhost:3001').split(',').map(s=>s.trim()).filter(Boolean);
console.log('[startup] allowed CORS origins:', DEFAULT_CORS);
app.use(cors({
  origin: function(origin, callback){
    // allow non-browser tools (no origin)
    if(!origin) return callback(null, true);
    if(DEFAULT_CORS.indexOf(origin) !== -1) return callback(null, true);
    console.warn('[cors] blocked origin', origin);
    return callback(new Error('CORS origin not allowed'), false);
  },
  credentials: true
}));
// Allow larger JSON payloads (but prefer file uploads for images)
app.use(bodyParser.json({ limit: '10mb' }));
const port = process.env.PORT || 3001;
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const dataDir = path.join(process.cwd(), 'data');
async function ensureDataDir(){
  try{ await fs.mkdir(dataDir, { recursive: true }); }catch(e){}
}
// Simple stateless session token using HMAC (no extra deps)
const SESSION_SECRET = process.env.SESSION_SECRET || 'wispa_default_secret_change_me';
function base64url(input){ return Buffer.from(input).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
function signPayload(payload){
  const h = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64');
  return h.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function createSessionToken(userId, expiresInSec = 7*24*3600){
  const payload = JSON.stringify({ uid: userId, exp: Math.floor(Date.now()/1000) + expiresInSec });
  const b = base64url(payload);
  const sig = signPayload(b);
  return b + '.' + sig;
}
function parseSessionToken(token){
  if(!token) return null;
  const parts = token.split('.'); if(parts.length !== 2) return null;
  const [b, sig] = parts;
  const expected = signPayload(b);
  if(!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try{ const payload = JSON.parse(Buffer.from(b, 'base64').toString('utf8')); return payload; }catch(e){ return null; }
}
function readCookie(req, name){
  const header = req.headers && req.headers.cookie; if(!header) return null;
  const m = header.split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='));
  if(!m) return null; return decodeURIComponent(m.split('=').slice(1).join('='));
}
async function getSessionUser(req){
  const token = readCookie(req, 'wispa_session');
  if(!token) return null;
  const payload = parseSessionToken(token);
  if(!payload || !payload.uid || payload.exp < Math.floor(Date.now()/1000)) return null;
  try{
    const r = await pool.query('SELECT id, username, email, full_name, role, created_at FROM users WHERE id = $1', [payload.uid]);
    if (r.rows && r.rows[0]) return r.rows[0];
    // If not found in users table, check admin_logins table (admins stored separately)
    try{
      const a = await pool.query('SELECT id, username, email, created_at FROM admin_logins WHERE id = $1', [payload.uid]);
      if (a.rows && a.rows[0]) {
        const adminRow = a.rows[0];
        return { id: adminRow.id, username: adminRow.username, email: adminRow.email, full_name: adminRow.full_name || null, role: 'admin', created_at: adminRow.created_at };
      }
    }catch(e){ /* ignore admin lookup errors */ }
    return null;
  }catch(e){ return null; }
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
    const result = userId
      ? await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId])
      : await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
    return res.json({ notifications: result.rows });
  } catch (err) {
    // Fallback: deployments may not have a `notifications` table. Try file-backed store.
    try {
      const rows = await readJson('notifications.json');
      const filtered = userId ? (rows.filter(r => String(r.user_id || r.userId || r.user) === String(userId))) : rows;
      return res.json({ notifications: filtered });
    } catch (e) {
      res.status(500).json({ error: 'Database error fetching notifications', details: err.message });
    }
  }
});

// Get conversations for a user (real DB)
app.get("/api/conversations", async (req, res) => {
  const userId = req.query.userId;
  function sanitizeTitle(t){ try{ if(!t) return t; if(typeof t !== 'string') return t; const s = t.trim(); if(!s) return null; if(s.toLowerCase() === 'undefined') return null; return s; }catch(e){return t} }
  try {
    const result = userId
      ? await pool.query('SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated DESC', [userId])
      : await pool.query('SELECT * FROM conversations ORDER BY updated DESC');
    // sanitize titles to avoid literal 'undefined' showing in UI
    const rows = (result.rows || []).map(r => (Object.assign({}, r, { title: sanitizeTitle(r.title) })));
    return res.json({ conversations: rows });
  } catch (err) {
    // Fallback: some deployments use an older schema without a `conversations` table.
    // Try to synthesize a conversations list from the legacy `messages` table instead
    try {
      const msgResult = userId
        ? await pool.query('SELECT * FROM messages WHERE sender_id = $1 OR receiver_id = $1 ORDER BY sent_at DESC', [userId])
        : await pool.query('SELECT * FROM messages ORDER BY sent_at DESC');
      const rows = msgResult.rows || [];
      const convMap = new Map();
      for (const m of rows) {
        // Determine a simple conversation key (other party id or 'unknown')
        const other = (userId && m.sender_id && String(m.sender_id) !== String(userId)) ? m.sender_id
                    : (userId && m.receiver_id && String(m.receiver_id) !== String(userId)) ? m.receiver_id
                    : (m.sender_id || m.receiver_id || 'unknown');
        const key = 'user-' + String(other);
        if (!convMap.has(key)) {
          convMap.set(key, { id: key, last: m.content || null, updated: m.sent_at || new Date().toISOString(), unread: 0 });
        }
      }
      const convs = Array.from(convMap.values()).map(c => (Object.assign({}, c, { title: sanitizeTitle(c.title) })));
      return res.json({ conversations: convs });
    } catch (e) {
      return res.status(500).json({ error: 'Database error fetching conversations', details: err.message });
    }
  }
});

// File-backed admin endpoints (notifications/chat/sent-notifs/profile/requests/contacts/reactions/alerts)
// Protect admin API routes: require authenticated user with role 'admin'
app.use('/api/admin', async (req, res, next) => {
  try {
    const user = await getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(401).json({ error: 'Admin authentication required' });
    // attach user to request for downstream handlers
    req.currentUser = user;
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Admin auth check failed' });
  }
});

app.get('/api/admin/sent-notifications', async (req, res) => {
  try {
    // Return notifications that were sent by admins. We mark these by storing `sentByAdmin: true` inside the JSON `data` column.
    const result = await pool.query(`SELECT * FROM notifications WHERE (data->> 'sentByAdmin') = 'true' ORDER BY created_at DESC`);
    return res.json({ notifications: result.rows });
  } catch (err) {
    // If the notifications table or JSON access is not available, return a helpful error
    return res.status(500).json({ error: 'Failed to load sent notifications', details: err.message });
  }
});

app.post('/api/admin/sent-notifications', async (req, res) => {
  try {
    const admin = req.currentUser;
    if (!admin) return res.status(401).json({ error: 'Admin authentication required' });
    const { title, body, data } = req.body || {};
    if (!title && !body) return res.status(400).json({ error: 'Missing title or body' });
    const payload = Object.assign({}, data || {}, { sentByAdmin: true, adminId: admin.id });
    const createdAt = new Date().toISOString();
    const insert = await pool.query(
      'INSERT INTO notifications (user_id, title, body, data, created_at, read) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [null, title || null, body || null, JSON.stringify(payload), createdAt, false]
    );
    return res.json({ notification: insert.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create sent notification', details: err.message });
  }
});

app.get('/api/admin/profile', async (req, res) => {
  try {
    const user = req.currentUser || null;
    if (!user) return res.status(401).json({ error: 'Admin authentication required' });
    // Build a presentation-friendly profile object for admin UI
    const profile = {
      adminName: user.full_name || user.username || user.email || null,
      adminRole: user.role || 'admin',
      adminEmail: user.email || user.username || null,
      adminAvatar: user.avatar_url || user.avatar || null,
      adminSince: user.created_at ? new Date(user.created_at).toISOString() : null
    };
    return res.json({ profile });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load admin profile', details: e.message });
  }
});
app.post('/api/admin/profile', async (req, res) => {
  res.status(501).json({ error: 'Admin profile endpoint not implemented on server. Configure a DB-backed store.' });
});

app.get('/api/property-requests', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM property_requests ORDER BY created_at DESC');
    return res.json({ requests: result.rows });
  } catch (err) {
    // Fallback to file-backed store
    try {
      const rows = await readJson('property_requests.json');
      return res.json({ requests: rows });
    } catch (e) {
      return res.status(500).json({ error: 'Property requests not available', details: err.message });
    }
  }
});
app.post('/api/property-requests', async (req, res) => {
  const { userId, propertyId, message } = req.body || {};
  const createdAt = new Date().toISOString();
  try {
    const insert = await pool.query(
      'INSERT INTO property_requests (user_id, property_id, message, status, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [userId || null, propertyId || null, message || null, 'open', createdAt]
    );
    return res.json({ request: insert.rows[0] });
  } catch (err) {
    // Fallback to file JSON
    try {
      const arr = await readJson('property_requests.json');
      const entry = { id: Date.now(), userId, propertyId, message, status: 'open', createdAt };
      arr.unshift(entry);
      await writeJson('property_requests.json', arr);
      return res.json({ request: entry, fallback: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create property request', details: err.message });
    }
  }
});

app.get('/api/contact-messages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    return res.json({ messages: result.rows });
  } catch (err) {
    try {
      const rows = await readJson('contact_messages.json');
      return res.json({ messages: rows });
    } catch (e) {
      return res.status(500).json({ error: 'Contact messages not available', details: err.message });
    }
  }
});
app.post('/api/contact-messages', async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  const createdAt = new Date().toISOString();
  try {
    const insert = await pool.query(
      'INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name || null, email || null, subject || null, message || null, createdAt]
    );
    return res.json({ message: insert.rows[0] });
  } catch (err) {
    try {
      const arr = await readJson('contact_messages.json');
      const entry = { id: Date.now(), name, email, subject, message, createdAt };
      arr.unshift(entry);
      await writeJson('contact_messages.json', arr);
      return res.json({ message: entry, fallback: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save contact message', details: err.message });
    }
  }
});

app.get('/api/notification-reactions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notification_reactions ORDER BY created_at DESC');
    return res.json({ reactions: result.rows });
  } catch (err) {
    try {
      const rows = await readJson('notification_reactions.json');
      return res.json({ reactions: rows });
    } catch (e) {
      return res.status(500).json({ error: 'Notification reactions not available', details: err.message });
    }
  }
});
app.post('/api/notification-reactions', async (req, res) => {
  const { notificationId, userId, reaction } = req.body || {};
  const createdAt = new Date().toISOString();
  try {
    const insert = await pool.query(
      'INSERT INTO notification_reactions (notification_id, user_id, reaction, created_at) VALUES ($1,$2,$3,$4) RETURNING *',
      [notificationId || null, userId || null, reaction || null, createdAt]
    );
    return res.json({ reaction: insert.rows[0] });
  } catch (err) {
    try {
      const arr = await readJson('notification_reactions.json');
      const entry = { id: Date.now(), notificationId, userId, reaction, createdAt };
      arr.unshift(entry);
      await writeJson('notification_reactions.json', arr);
      return res.json({ reaction: entry, fallback: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to record reaction', details: err.message });
    }
  }
});

app.get('/api/system-alerts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_alerts ORDER BY created_at DESC');
    return res.json({ alerts: result.rows });
  } catch (err) {
    try {
      const rows = await readJson('system_alerts.json');
      return res.json({ alerts: rows });
    } catch (e) {
      return res.status(500).json({ error: 'System alerts not available', details: err.message });
    }
  }
});
app.post('/api/system-alerts', async (req, res) => {
  const { title, body, severity } = req.body || {};
  const createdAt = new Date().toISOString();
  try {
    const insert = await pool.query(
      'INSERT INTO system_alerts (title, body, severity, created_at) VALUES ($1,$2,$3,$4) RETURNING *',
      [title || null, body || null, severity || 'info', createdAt]
    );
    return res.json({ alert: insert.rows[0] });
  } catch (err) {
    try {
      const arr = await readJson('system_alerts.json');
      const entry = { id: Date.now(), title, body, severity: severity || 'info', createdAt };
      arr.unshift(entry);
      await writeJson('system_alerts.json', arr);
      return res.json({ alert: entry, fallback: true });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to create alert', details: err.message });
    }
  }
});

// Generic admin sync endpoint removed: file-backed sync is not allowed in DB-only mode
app.post('/api/admin/sync', async (req, res) => {
  res.status(501).json({ error: 'admin/sync disabled: file-backed admin sync is not allowed. Implement DB-backed admin sync.' });
});
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const hostBase = (process.env.API_HOST || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
  const imageUrl = `${hostBase}/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// Upload multiple files for property photos
app.post('/api/upload-photos', upload.array('files'), (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    const hostBase = (process.env.API_HOST || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const urls = req.files.map(f => `${hostBase}/uploads/${f.filename}`);
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
    const result = await pool.query(
      'INSERT INTO notifications (user_id, title, body, data, created_at, read) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [userId, notification.title || null, notification.message || notification.fullMessage || null, JSON.stringify(notification || {}), notification.timestamp || new Date().toISOString(), notification.read ? true : false]
    );
    return res.json({ notification: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Database error creating notification', details: err.message });
  }
});

// Append a message to a conversation (DB first, fallback to file)
app.post('/api/conversations/messages', async (req, res) => {
  const { convId, message } = req.body || {};
  if (!convId || !message) return res.status(400).json({ error: 'Missing convId or message' });
  try {
    // Ensure a conversation row exists (create if missing)
    try {
      const convCheck = await pool.query('SELECT id FROM conversations WHERE id = $1', [convId]);
      if (convCheck.rows.length === 0) {
        // Create a minimal conversation record. Prefer userId from message if present.
        const userId = message.userId || null;
        // Normalize conversation title: prefer explicit meta.title, then meta.property.title; sanitize empty/undefined strings
        let title = null;
        try {
          if (message.meta && typeof message.meta === 'object') {
            if (message.meta.title && typeof message.meta.title === 'string' && message.meta.title.trim()) title = message.meta.title.trim();
            else if (message.meta.property && message.meta.property.title && typeof message.meta.property.title === 'string' && message.meta.property.title.trim()) title = message.meta.property.title.trim();
          }
        } catch (e) { title = null; }
        await pool.query('INSERT INTO conversations (id, user_id, title, last_message, updated) VALUES ($1,$2,$3,$4,$5)', [convId, userId, title, message.text || message.body || null, message.ts ? new Date(message.ts).toISOString() : new Date().toISOString()]);
      }
    } catch (e) {
      // If conversations table doesn't exist or insert fails, continue and rely on message fallback below
    }

    const result = await pool.query(
      'INSERT INTO messages (conversation_id, sender, body, meta, sent_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [convId, message.sender || null, message.text || message.body || null, JSON.stringify(message || {}), message.ts ? new Date(message.ts).toISOString() : new Date().toISOString()]
    );

    // Update conversation metadata (last_message, updated) if possible
    try {
      await pool.query('UPDATE conversations SET last_message = $1, updated = $2 WHERE id = $3', [message.text || message.body || null, message.ts ? new Date(message.ts).toISOString() : new Date().toISOString(), convId]);
    } catch (e) { /* ignore update failures */ }

    return res.json({ message: result.rows[0] });
  } catch (err) {
    // Fallback for older schema: messages table may be legacy with (sender_id, receiver_id, content, sent_at)
    try {
      const senderId = message.userId || null;
      const receiverId = null;
      const content = (message.text || message.body) ? String(message.text || message.body) : JSON.stringify(message || {});
      const sentAt = message.ts ? new Date(message.ts).toISOString() : new Date().toISOString();
      const r2 = await pool.query('INSERT INTO messages (sender_id, receiver_id, content, sent_at) VALUES ($1,$2,$3,$4) RETURNING *', [senderId, receiverId, content, sentAt]);
      // If possible, annotate the legacy row with conversation_id so future queries work
      try {
        if (r2.rows && r2.rows[0] && r2.rows[0].id) {
          await pool.query('UPDATE messages SET conversation_id = $1 WHERE id = $2', [convId, r2.rows[0].id]);
        }
      } catch (e) { /* ignore */ }
      // Ensure a conversations row exists (create or update) so the conversation appears for the user/admin
      try {
        const convUserId = message.userId || null;
        // sanitize convTitle similar to above
        let convTitle = null;
        try {
          if (message.meta && typeof message.meta === 'object') {
            if (message.meta.title && typeof message.meta.title === 'string' && message.meta.title.trim()) convTitle = message.meta.title.trim();
            else if (message.meta.property && message.meta.property.title && typeof message.meta.property.title === 'string' && message.meta.property.title.trim()) convTitle = message.meta.property.title.trim();
          }
        } catch (ee) { convTitle = null; }
        await pool.query(
          `INSERT INTO conversations (id, user_id, title, last_message, updated)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO UPDATE SET last_message = EXCLUDED.last_message, updated = EXCLUDED.updated, user_id = EXCLUDED.user_id`,
          [convId, convUserId, convTitle, content, sentAt]
        );
      } catch (e) {}
      return res.json({ message: r2.rows[0], fallback: true });
    } catch (e2) {
      res.status(500).json({ error: 'Database error appending message', details: err.message + ' / ' + (e2 && e2.message) });
    }
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

// Get messages for a specific conversation
app.get('/api/conversations/:id/messages', async (req, res) => {
  const convId = req.params.id;
  if (!convId) return res.status(400).json({ error: 'Missing conversation id' });
  try {
    // Prefer conversation_id column
    const result = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC', [convId]);
    // If no rows, attempt a fallback that matches conversation_id or legacy mapping
    if (!result.rows || result.rows.length === 0) {
      try {
        const fallback = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 OR (meta->>\'legacy_sender_id\' = $2) OR (meta->>\'legacy_receiver_id\' = $2) ORDER BY sent_at ASC', [convId, convId.replace(/^user-/, '')]);
        return res.json({ messages: fallback.rows });
      } catch (e) {
        return res.json({ messages: [] });
      }
    }
    return res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Database error fetching conversation messages', details: err.message });
  }
});


// Property upload endpoint
app.post("/api/properties", async (req, res) => {
  // Accept multiple client shapes: { property, photoUrls },
  // { property, photos }, { property, images }, or a top-level property object
  let body = req.body || {};
  // Accept array payloads (some clients send [propertyObj]) — use first element
  if (Array.isArray(body)) {
    console.debug('/api/properties received an array payload, using first element');
    if (body.length === 0) return res.status(400).json({ error: 'Empty array payload' });
    body = body[0];
  }
  console.debug('/api/properties received body:', body);
  let property = body.property || null;
  // If the client sent an array under `property` or `properties`, use the first element
  if (Array.isArray(property)) {
    property = property[0];
  }
  if (!property && Array.isArray(body.properties)) {
    property = body.properties[0];
  }
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

  // Note: idempotency file mapping has been removed — rely on DB uniqueness and advisory locks.

  try {
    const resObj = await addPropertyWithPhotos(property, photoUrls);
    // resObj contains { property, propertyId }
    // No file-backed idempotency persistence; rely on DB-side protections.
    // Trigger async document generation for the created/updated property (fire-and-forget)
    try {
      const createdId = resObj.propertyId || (resObj.property && resObj.property.id) || null;
      if (createdId) {
        (async () => {
          try {
            const url = `${req.protocol}://${req.get('host')}/api/properties/${createdId}/generate-document`;
            if (typeof fetch === 'function') {
              await fetch(url, { method: 'POST' });
            } else {
              // Node older versions may not have global fetch; attempt dynamic import
              try {
                const nodeFetch = await import('node-fetch');
                await nodeFetch.default(url, { method: 'POST' });
              } catch (e) {
                // ignore if fetch is unavailable
              }
            }
          } catch (e) {
            console.error('Background generate-document failed for property', createdId, e && e.stack ? e.stack : e);
          }
        })();
      }
    } catch (e) {
      // ignore background job scheduling errors
    }
    if (resObj && resObj.property) return res.json({ property: resObj.property, propertyId: resObj.propertyId });
    if (resObj && resObj.propertyId) return res.json({ propertyId: resObj.propertyId });
    return res.json({ propertyId: resObj });
  } catch (err) {
    console.error('addPropertyWithPhotos error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Database error creating/updating property', details: err.message });
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
    // Create session cookie
    try{
      const token = createSessionToken(user.id);
      // For cross-site logins, set SameSite=None and secure in production so browsers accept the cookie
      const cookieOpts = {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7*24*3600*1000
      };
      res.cookie('wispa_session', token, cookieOpts);
    }catch(e){ /* ignore cookie set errors */ }
    res.json({ user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role, created_at: user.created_at } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Who am I - return currently authenticated user based on session cookie
app.get('/api/me', async (req, res) => {
  try{
    const user = await getSessionUser(req);
    if(!user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json({ user });
  }catch(e){ res.status(500).json({ error: 'Error checking session' }); }
});

// Logout: clear session cookie
app.post('/api/logout', async (req, res) => {
  try {
    res.cookie('wispa_session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 0 });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to clear session' });
  }
});

// Persist user acceptance of agreements. This endpoint is best-effort: if the
// `users` table contains an `agreements_accepted` (or similar) boolean column
// it will be updated. Otherwise we fall back to a file-backed store so the
// frontend can call this endpoint without receiving a 404.
app.post('/api/users/accept-agreements', async (req, res) => {
  try {
    // Prefer session user when available
    let userId = null;
    try{
      const u = await getSessionUser(req);
      if (u && u.id) userId = u.id;
    }catch(e){}

    // Accept explicit userId in body as a best-effort fallback
    if(!userId && req.body && req.body.userId) userId = req.body.userId;
    if(!userId) return res.status(400).json({ error: 'Missing userId' });

    // Try to update DB column if present
    try {
      await pool.query('UPDATE users SET agreements_accepted = true WHERE id = $1', [userId]);
      return res.json({ success: true });
    } catch (e) {
      // If column doesn't exist or DB update fails, fall back to file store
      try {
        const arr = await readJson('agreements.json');
        const entry = { userId: userId, acceptedAt: new Date().toISOString() };
        // replace existing entry for userId if present
        const idx = arr.findIndex(x => String(x.userId) === String(userId));
        if (idx > -1) arr[idx] = entry; else arr.unshift(entry);
        await writeJson('agreements.json', arr);
        return res.json({ success: true, fallback: true });
      } catch (e2) {
        return res.status(500).json({ error: 'Failed to persist acceptance', details: e2.message });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Admin login (authenticate against `users` table and set session cookie)
app.post("/api/admin-login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    // Find admin user in admin_logins table (by username or email)
    const result = await pool.query(
      "SELECT * FROM admin_logins WHERE username = $1 OR email = $1",
      [username]
    );
    if (result.rows.length === 0) {
      console.warn('[admin-login] no admin user found for', username);
      return res.status(401).json({ error: "Invalid credentials or not an admin" });
    }
    const admin = result.rows[0];
    const match = await bcrypt.compare(password, admin.password_hash || '');
    if (!match) {
      console.warn('[admin-login] password mismatch for user', username, 'id', admin.id);
      return res.status(401).json({ error: "Invalid credentials or not an admin" });
    }
    console.log('[admin-login] success for user', username, 'id', admin.id);
    // Create session cookie (same behavior as /api/login)
    try{
      const token = createSessionToken(admin.id);
      const cookieOpts = {
        httpOnly: true,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7*24*3600*1000
      };
      res.cookie('wispa_session', token, cookieOpts);
    }catch(e){ /* ignore cookie set errors */ }
    res.json({ user: { id: admin.id, username: admin.username, email: admin.email, full_name: admin.full_name || 'Administrator', role: 'admin', created_at: admin.created_at } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin login redirect flow for cross-origin login: returns a URL on the API host
app.post('/api/admin-login-redirect', async (req, res) => {
  const { username, password, returnTo } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const result = await pool.query("SELECT * FROM admin_logins WHERE username = $1 OR email = $1", [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const admin = result.rows[0];
    const match = await bcrypt.compare(password, admin.password_hash || '');
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    // Create a session token (multi-day) and return a URL that will set it on the API origin
    const token = createSessionToken(admin.id); // default expiry (7 days)
    const host = (process.env.API_HOST || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const redirectPath = returnTo ? encodeURIComponent(returnTo) : encodeURIComponent('/admin.html');
    const url = `${host}/set-session?st=${encodeURIComponent(token)}&r=${redirectPath}`;
    return res.json({ url });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Set session token via query and redirect to UI (used by cross-origin login flow)
app.get('/set-session', async (req, res) => {
  const st = req.query.st;
  const r = req.query.r || '/admin.html';
  if (!st) return res.status(400).send('Missing token');
  try {
    // validate token briefly
    const payload = parseSessionToken(st);
    if (!payload || !payload.uid) return res.status(400).send('Invalid token');
    const cookieOpts = { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production', maxAge: (payload.exp - Math.floor(Date.now()/1000)) * 1000 };
    res.cookie('wispa_session', st, cookieOpts);
    return res.redirect(r);
  } catch (e) { return res.status(500).send('Failed to set session'); }
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
      let rows = result.rows || [];
      // For each DB row, fetch photos and include them
      for (let i = 0; i < rows.length; i++){
        const r = rows[i];
        try {
          const photosRes = await pool.query('SELECT photo_url FROM property_photos WHERE property_id = $1', [r.id]);
          const photos = photosRes.rows.map(p => p.photo_url).filter(Boolean);
          if (photos.length) r.images = photos;
        } catch(e) {
          // ignore photo fetch errors
        }
        // Use address column as location when present
        if (!r.location && r.address) r.location = r.address;
      }
      return res.json({ properties: rows });
    } catch (e) {
      return res.status(500).json({ error: 'Database error fetching properties', details: e.message });
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
    // Delete photos first (cascade may handle it depending on schema)
    await pool.query('DELETE FROM property_photos WHERE property_id = $1', [id]);
    const result = await pool.query('DELETE FROM properties WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Database error deleting property', details: err.message });
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

// Generate a simple property document (JSON) and store in uploads/, return URL
app.post('/api/properties/:id/generate-document', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Missing property id' });
  try {
    // Load property from DB
    let prop = null;
    try {
      const pRes = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
      if (pRes.rows && pRes.rows.length) prop = pRes.rows[0];
    } catch (e) {
      return res.status(500).json({ error: 'Database error fetching property', details: e.message });
    }
    if (!prop) return res.status(404).json({ error: 'Property not found' });

    // Gather photos if DB available
    let photos = [];
    try {
      const photosRes = await pool.query('SELECT photo_url FROM property_photos WHERE property_id = $1', [id]);
      photos = photosRes.rows.map(r => r.photo_url).filter(Boolean);
    } catch (e) { /* ignore */ }

    // Compose document content (simple JSON summary)
    const doc = {
      id: prop.id || id,
      title: prop.title || prop.name || '',
      description: prop.description || '',
      price: prop.price || null,
      address: prop.address || prop.location || null,
      bedrooms: prop.bedrooms || null,
      bathrooms: prop.bathrooms || null,
      type: prop.type || prop.property_type || null,
      images: photos.length ? photos : (prop.images || []),
      generated_at: new Date().toISOString()
    };

    // Ensure uploads dir exists
    const uploadsDir = path.join(process.cwd(), 'uploads');
    try { await fs.mkdir(uploadsDir, { recursive: true }); } catch (e) {}
    const filename = `property-doc-${String(id)}-${Date.now()}.json`;
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf8');
    const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`;

    // Optionally persist document_url in DB when possible
    try {
      await pool.query('UPDATE properties SET document_url = $1 WHERE id = $2', [url, id]);
    } catch (e) { /* ignore if column doesn't exist */ }

    return res.json({ documentUrl: url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
