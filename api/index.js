
import dotenv from 'dotenv';
dotenv.config();
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
// Configure SSL for cloud-hosted databases. Render/Postgres often requires SSL;
// enable non-authoritative SSL when connecting to known hosts or in production.
const shouldUseSsl = (process.env.NODE_ENV === 'production') || (process.env.DATABASE_URL && String(process.env.DATABASE_URL).includes('render.com'));
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
});

// Quick startup DB test to surface connection errors early in logs
(async function startupDbCheck(){
  if(!process.env.DATABASE_URL) return;
  try{
    const r = await pool.query('SELECT NOW() as now');
    console.log('[db] connected, now=', r.rows && r.rows[0] && r.rows[0].now);
  }catch(e){
    console.error('[db] connection test failed:', e && e.message ? e.message : e);
  }
})();

// Import property helper after pool is defined to avoid circular import issues
import { addPropertyWithPhotos } from "./property.js";

const app = express();
// Respect X-Forwarded-* headers from proxies (so req.protocol reflects original scheme)
app.set('trust proxy', true);
// Allow configured origin(s) and credentials for cross-site session cookies
// Support multiple origins via comma-separated `CORS_ORIGINS` env var or sensible defaults
const DEFAULT_CORS = (process.env.CORS_ORIGINS || 'https://wispa-real-estate-one.vercel.app,https://wispa-real-estate-2ew3.onrender.com,http://localhost:3000,http://localhost:3001').split(',').map(s=>s.trim()).filter(Boolean);
console.log('[startup] allowed CORS origins:', DEFAULT_CORS);
// Mask and log DATABASE_URL to help confirm which DB the running instance uses (credentials masked)
try{
  const rawDb = process.env.DATABASE_URL || '';
  let masked = rawDb;
  try{ masked = String(rawDb).replace(/\/\/.*@/, '//***@'); }catch(e){ masked = rawDb ? '***' : '' }
  console.log('[startup] DATABASE_URL (masked):', masked || '(not set)');
}catch(e){ console.warn('[startup] failed to read DATABASE_URL', e && e.message ? e.message : e); }
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
    const r = await pool.query('SELECT id, username, email, full_name, role, created_at, location, avatar_url, phone, bio FROM users WHERE id = $1', [payload.uid]);
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
// Read admin session cookie and return admin user row when valid
async function getAdminSessionUser(req){
  const token = readCookie(req, 'wispa_admin_session');
  if(!token) return null;
  const payload = parseSessionToken(token);
  if(!payload || !payload.uid || payload.exp < Math.floor(Date.now()/1000)) return null;
  try{
    const a = await pool.query('SELECT id, username, email, created_at, full_name FROM admin_logins WHERE id = $1', [payload.uid]);
    if(a && a.rows && a.rows[0]){
      const adminRow = a.rows[0];
      return { id: adminRow.id, username: adminRow.username, email: adminRow.email, full_name: adminRow.full_name || null, role: 'admin', created_at: adminRow.created_at };
    }
  }catch(e){ }
  return null;
}
// Expose a safe validation endpoint: checks current session and returns admin record
// when the session corresponds to an admin login (by id or email). This endpoint
// does not require the admin cookie but does require a valid session cookie.
app.get('/api/admin/validate', async (req, res) => {
  try {
    const sessUser = await getSessionUser(req);
    if (!sessUser) return res.status(401).json({ error: 'No session' });
    try {
      const a = await pool.query('SELECT id, username, email, created_at, full_name FROM admin_logins WHERE id = $1 OR email = $2 LIMIT 1', [sessUser.id, sessUser.email]);
      if (a && a.rows && a.rows[0]) {
        const ar = a.rows[0];
        const admin = { id: ar.id, username: ar.username, email: ar.email, full_name: ar.full_name || null, role: 'admin', created_at: ar.created_at };
        return res.json({ admin });
      }
    } catch (e) {
      // ignore DB lookup issues
    }
    return res.status(403).json({ error: 'Not an admin' });
  } catch (e) {
    return res.status(500).json({ error: 'Admin validate failed' });
  }
});
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
  const category = req.query.category;
  try {
    let result;
    if (userId && category) {
      result = await pool.query('SELECT * FROM notifications WHERE (user_id = $1 OR target = $1) AND category = $2 ORDER BY created_at DESC', [userId, category]);
    } else if (userId) {
      result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 OR target = $1 ORDER BY created_at DESC', [userId]);
    } else if (category) {
      result = await pool.query('SELECT * FROM notifications WHERE category = $1 ORDER BY created_at DESC', [category]);
    } else {
      result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
    }
    return res.json({ notifications: result.rows });
  } catch (err) {
    // Fallback: deployments may not have a `notifications` table. Try file-backed store.
    try {
      const rows = await readJson('notifications.json');
      let filtered = rows;
      if (userId) filtered = rows.filter(r => String(r.user_id || r.userId || r.user || r.target) === String(userId));
      if (category) filtered = filtered.filter(r => String(r.category || 'all') === String(category));
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
    let rows = (result.rows || []).map(r => (Object.assign({}, r, { title: sanitizeTitle(r.title) })));
    try{
      // Attach the most-recent message.meta (if present) to each conversation so the frontend can render property previews reliably
      await Promise.all(rows.map(async (c, idx) => {
        try{
          // Try to find most recent message with meta; if none, attempt to parse legacy `content` column
          const mres = await pool.query('SELECT meta, content, body FROM messages WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 1', [c.id]);
          if(mres && mres.rows && mres.rows[0]){
            let mm = mres.rows[0].meta || null;
            if(!mm && mres.rows[0].content && typeof mres.rows[0].content === 'string'){
              try{ mm = JSON.parse(mres.rows[0].content); }catch(e){ mm = null }
            }
            if(mm){
              try{ const parsed = (typeof mm === 'string') ? JSON.parse(mm) : mm; rows[idx].meta = parsed; if(parsed && parsed.property) rows[idx].property = parsed.property; }catch(e){}
            }
          }
          // Fallback: if no meta/property found, and conversation id is of form property-<id>, try to load property row directly
          if((!rows[idx].property || !rows[idx].property.id) && typeof c.id === 'string'){
            // Match conversation ids that start with property-<id> (allow suffixes like property-524-WISPA-...)
            const m = c.id.match(/^property-(\d+)/i);
            if(m){
              try{
                const pid = parseInt(m[1],10);
                const pres = await pool.query('SELECT id, title, image_url, images FROM properties WHERE id = $1 LIMIT 1', [pid]);
                if(pres && pres.rows && pres.rows[0]){
                  rows[idx].property = pres.rows[0];
                }
              }catch(e){}
            }
          }
        }catch(e){}
      }));
    }catch(e){}
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
    // Prefer explicit admin session cookie
    let admin = await getAdminSessionUser(req);
    // Fallback: if no admin cookie, allow a regular session only if its uid or email exists in admin_logins
    if (!admin) {
      const sessUser = await getSessionUser(req);
      if (sessUser && sessUser.id) {
        try{
          const a = await pool.query('SELECT id, username, email, created_at, full_name FROM admin_logins WHERE id = $1 OR email = $2 LIMIT 1', [sessUser.id, sessUser.email]);
          if (a && a.rows && a.rows[0]) {
            const ar = a.rows[0];
            admin = { id: ar.id, username: ar.username, email: ar.email, full_name: ar.full_name || null, role: 'admin', created_at: ar.created_at };
          }
        }catch(e){}
      }
    }
    if (!admin || admin.role !== 'admin') return res.status(401).json({ error: 'Admin authentication required' });
    // attach admin to request for downstream handlers
    req.currentUser = admin;
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
    try {
      const insert = await pool.query(
        `INSERT INTO notifications (category, title, body, target, data, is_read, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        ['sent_alert', title || null, body || null, null, JSON.stringify(payload), false, createdAt, createdAt]
      );
      return res.json({ notification: insert.rows[0] });
    } catch (errInsert) {
      // Fallback for older deployments that expect legacy columns (user_id, read)
      try {
        const insert2 = await pool.query(
          'INSERT INTO notifications (user_id, title, body, data, created_at, read) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [null, title || null, body || null, JSON.stringify(payload), createdAt, false]
        );
        return res.json({ notification: insert2.rows[0] });
      } catch (err2) {
        return res.status(500).json({ error: 'Failed to create sent notification', details: err2.message || errInsert.message });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create sent notification', details: err.message });
  }
});

// Admin: list notifications (optionally filter by category)
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const category = req.query.category;
    let result;
    if (category) {
      result = await pool.query('SELECT * FROM notifications WHERE category = $1 ORDER BY created_at DESC', [category]);
    } else {
      result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
    }
    return res.json({ notifications: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load notifications', details: err.message });
  }
});

// Admin: recent messages summary (contact messages + conversations)
app.get('/api/admin/messages', async (req, res) => {
  try {
    // recent contact messages
    let contacts = [];
    try{
      const cm = await pool.query('SELECT id, name, email, subject, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 100');
      contacts = (cm && cm.rows) ? cm.rows.map(r=>({ id: r.id, from: r.email || r.name, subject: r.subject || null, body: r.message, createdAt: r.created_at })) : [];
    }catch(e){ contacts = []; }

    // recent conversations
    let convs = [];
    try{
      const cr = await pool.query('SELECT id, title, last_message, updated FROM conversations ORDER BY updated DESC LIMIT 100');
      convs = (cr && cr.rows) ? cr.rows.map(r=>({ id: r.id, title: r.title, lastMessage: r.last_message || r.lastMessage || '', updated: r.updated })) : [];
    }catch(e){ convs = []; }

    // merge into a single list for the admin overview
    const messages = [].concat(convs.map(c=>({ type: 'conversation', id: c.id, title: c.title, preview: c.lastMessage, time: c.updated })), contacts.map(m=>({ type: 'contact', id: m.id, title: m.subject||m.from, preview: m.body, time: m.createdAt })));
    return res.json({ messages });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load admin messages', details: err.message });
  }
});

// Activities feed: expose recent notifications as activities
app.get('/api/activities', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, category, title, body, target, data, is_read, created_at, updated_at FROM notifications ORDER BY created_at DESC LIMIT 200');
    return res.json({ activities: result.rows });
  } catch (err) {
    try {
      const rows = await readJson('notifications.json');
      return res.json({ activities: rows });
    } catch (e) {
      return res.status(500).json({ error: 'Activities not available', details: err.message });
    }
  }
});

// Admin: mark notification as read
app.post('/api/admin/notifications/:id/read', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query('UPDATE notifications SET is_read = true, updated_at = now() WHERE id = $1 RETURNING *', [id]);
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ notification: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark notification read', details: err.message });
  }
});

// Admin: mark notification as unread
app.post('/api/admin/notifications/:id/unread', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query('UPDATE notifications SET is_read = false, updated_at = now() WHERE id = $1 RETURNING *', [id]);
    if (!result.rows || result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ notification: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark notification unread', details: err.message });
  }
});

app.get('/api/admin/profile', async (req, res) => {
  try {
    // Prefer admin session user when available
    const adminRow = await getAdminSessionUser(req);
    if (!adminRow) {
      // fallback to regular session user if admin session not present
      const sess = await getSessionUser(req);
      if (!sess) return res.status(401).json({ error: 'Admin authentication required' });
      // return session user directly
      return res.json(sess);
    }

    // Try to find a corresponding users row (extended profile) by id or email
    try{
      const u = await pool.query('SELECT id, username, email, full_name, role, created_at, location, avatar_url, phone, bio, gender FROM users WHERE id = $1 OR email = $2 LIMIT 1', [adminRow.id, adminRow.email]);
      if(u && u.rows && u.rows[0]){
        return res.json(u.rows[0]);
      }
    }catch(e){ /* ignore and fall back to adminRow mapping */ }

    // If no users row, return admin_logins presentation mapping
    const profile = {
      id: adminRow.id,
      username: adminRow.username,
      email: adminRow.email,
      full_name: adminRow.full_name || adminRow.username || adminRow.email || null,
      role: 'admin',
      created_at: adminRow.created_at || null
    };
    return res.json(profile);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load admin profile', details: e.message });
  }
});
app.post('/api/admin/profile', async (req, res) => {
  try {
    // Accept either { user: { ... } } or direct body
    const body = req.body && req.body.user ? req.body.user : (req.body || {});
    const sessAdmin = await getAdminSessionUser(req);
    const sess = sessAdmin || await getSessionUser(req);
    if (!sess) return res.status(401).json({ error: 'Admin authentication required' });

    // Try to update users row if exists (prefer authoritative users table)
    try{
      const urow = await pool.query('SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1', [sess.id, sess.email]);
      if(urow && urow.rows && urow.rows[0]){
        const userId = urow.rows[0].id;
        const allowed = ['full_name','username','email','location','avatar_url','phone','bio','gender'];
        const provided = Object.keys(body || {}).filter(k => allowed.indexOf(k) !== -1);
        if(provided.length===0) return res.status(400).json({ error: 'No updatable fields provided' });
        // check existing columns
        const colsRes = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = ANY($1::text[])`,
          [allowed]
        );
        const existing = (colsRes.rows || []).map(r => r.column_name);
        const toUpdate = provided.filter(p => existing.indexOf(p) !== -1);
        if(toUpdate.length===0) return res.status(400).json({ error: 'No writable columns exist on DB' });
        const sets = toUpdate.map((c, idx) => `${c} = $${idx+1}`);
        const values = toUpdate.map(c => body[c] === undefined ? null : body[c]);
        const sql = `UPDATE users SET ${sets.join(', ')} WHERE id = $${toUpdate.length + 1} RETURNING id, username, email, full_name, role, created_at, location, avatar_url, phone, bio, gender`;
        const result = await pool.query(sql, [...values, userId]);
        if(result && result.rows && result.rows[0]) return res.json(result.rows[0]);
        return res.status(500).json({ error: 'Failed to update user' });
      }
    }catch(e){ console.warn('users update failed', e); }

    // If no users row, update admin_logins where possible (limited fields)
    try{
      const arow = await pool.query('SELECT id FROM admin_logins WHERE id = $1 OR email = $2 LIMIT 1', [sess.id, sess.email]);
      if(arow && arow.rows && arow.rows[0]){
        const adminId = arow.rows[0].id;
        const allowedAdmin = ['username','email','full_name'];
        const provided = Object.keys(body || {}).filter(k => allowedAdmin.indexOf(k) !== -1);
        if(provided.length===0) return res.status(400).json({ error: 'No updatable admin fields provided' });
        const sets = provided.map((c, idx) => `${c} = $${idx+1}`);
        const values = provided.map(c => body[c] === undefined ? null : body[c]);
        const sql = `UPDATE admin_logins SET ${sets.join(', ')} WHERE id = $${provided.length + 1} RETURNING id, username, email, created_at, full_name`;
        const result = await pool.query(sql, [...values, adminId]);
        if(result && result.rows && result.rows[0]) return res.json(result.rows[0]);
        return res.status(500).json({ error: 'Failed to update admin_logins' });
      }
    }catch(e){ console.warn('admin_logins update failed', e); }

    return res.status(400).json({ error: 'No matching account to update' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update admin profile', details: err.message });
  }
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

// Activities: recent user/activity feed (DB first, fallback to file)
app.get('/api/admin/profile', async (req, res) => {
  try {
    const admin = await getAdminSessionUser(req);
    if (!admin) return res.status(401).json({ error: 'not authenticated' });

    // Return the admin_logins row as the single source of truth for admin profiles
    const q = await pool.query(
      `SELECT id, username, email, full_name, role, created_at, avatar_url, phone, bio, gender FROM admin_logins WHERE id = $1 LIMIT 1`,
      [admin.id]
    );
    if (q.rows && q.rows.length > 0) return res.json(q.rows[0]);
    return res.status(404).json({ error: 'not found' });
  } catch (err) {
    console.error('GET /api/admin/profile', err);
    return res.status(500).json({ error: 'server error' });
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
// Upload multiple files for property photos
app.post('/api/upload-photos', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    const hostBase = (process.env.API_HOST || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const urls = req.files.map(f => `${hostBase}/uploads/${f.filename}`);

    // If client provided a propertyId (form field or query), persist the photo URLs into DB
    const propertyId = req.body && (req.body.propertyId || req.body.property_id) || req.query && (req.query.propertyId || req.query.property_id) || null;
    if (propertyId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Ensure property exists
        const p = await client.query('SELECT id FROM properties WHERE id = $1', [propertyId]);
        if (!p.rows || p.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Property not found' });
        }
        // Insert uploaded photos. By default replace existing photos for the property
        // unless client explicitly requests append via ?append=true
        const wantAppend = (req.query && String(req.query.append) === 'true');
        if (!wantAppend) {
          await client.query('DELETE FROM property_photos WHERE property_id = $1', [propertyId]);
        }
        for (const u of urls) {
          await client.query('INSERT INTO property_photos (property_id, photo_url) VALUES ($1, $2)', [propertyId, u]);
        }
        await client.query('COMMIT');
        return res.json({ urls, persisted: true, propertyId });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (e2) {}
        return res.status(500).json({ error: 'Failed to persist photos', details: e.message });
      } finally {
        client.release();
      }
    }

    // No propertyId: just return the public URLs
    return res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generic upload endpoint for chat attachments (docs, images, etc.)
app.post('/api/upload-attachments', upload.array('files'), (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    const hostBase = (process.env.API_HOST || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const urls = req.files.map(f => `${hostBase}/uploads/${f.filename}`);
    return res.json({ urls });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Create a notification for a user (DB first, fallback to file)
app.post('/api/notifications', async (req, res) => {
  const { userId, notification } = req.body || {};
  if (!userId || !notification) return res.status(400).json({ error: 'Missing userId or notification' });
  try {
    // Prefer new schema: category, target, data, is_read
    const createdAt = notification.timestamp || new Date().toISOString();
    const category = (notification && notification.category) || 'all';
    const target = userId ? String(userId) : (notification && (notification.userId || notification.target)) || null;
    try {
      const result = await pool.query(
        `INSERT INTO notifications (category, title, body, target, data, is_read, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [category, notification.title || null, notification.message || notification.fullMessage || null, target, JSON.stringify(notification || {}), notification.read ? true : false, createdAt, createdAt]
      );
      return res.json({ notification: result.rows[0] });
    } catch (errInsert) {
      // Fallback to legacy schema if present
      try {
        const result2 = await pool.query(
          'INSERT INTO notifications (user_id, title, body, data, created_at, read) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
          [userId, notification.title || null, notification.message || notification.fullMessage || null, JSON.stringify(notification || {}), createdAt, notification.read ? true : false]
        );
        return res.json({ notification: result2.rows[0] });
      } catch (err2) {
        // Final fallback: persist to a file-backed JSON store so notifications aren't lost
        try {
          const arr = await readJson('notifications.json');
          const entry = { id: Date.now(), category, target, title: notification.title || null, body: notification.message || notification.fullMessage || null, data: notification || {}, is_read: notification.read ? true : false, created_at: createdAt };
          arr.unshift(entry);
          await writeJson('notifications.json', arr);
          return res.json({ notification: entry, fallback: true });
        } catch (e) {
          return res.status(500).json({ error: 'Database error creating notification', details: errInsert.message + ' / ' + (err2 && err2.message) });
        }
      }
    }
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
      // If the messages table has a `meta` or `sender` column, try to persist the original message object
      try {
        const origMeta = JSON.stringify(message || {});
        const senderVal = message && message.sender ? message.sender : (message && message.userId ? 'user' : null);
        if (r2.rows && r2.rows[0] && r2.rows[0].id) {
          try {
            await pool.query('UPDATE messages SET meta = $1 WHERE id = $2', [origMeta, r2.rows[0].id]);
          } catch (e) { /* ignore if column missing */ }
          try {
            if (senderVal) await pool.query('UPDATE messages SET sender = $1 WHERE id = $2', [senderVal, r2.rows[0].id]);
          } catch (e) { /* ignore if column missing */ }
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
app.post('/api/admin/profile', async (req, res) => {
  try {
    const admin = await getAdminSessionUser(req);
    if (!admin) return res.status(401).json({ error: 'not authenticated' });

    // Update admin_logins as the single source of truth for admin profiles
    const allowed = ['full_name', 'username', 'email', 'avatar_url', 'phone', 'bio', 'gender'];
    const updates = [];
    const vals = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        updates.push(`${k} = $${i}`);
        vals.push(req.body[k]);
        i++;
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'no fields' });

    vals.push(admin.id);
    const sql = `UPDATE admin_logins SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, username, email, full_name, avatar_url, phone, bio, gender`;
    const r = await pool.query(sql, vals);
    return res.json(r.rows[0]);
  } catch (err) {
    console.error('POST /api/admin/profile', err);
    return res.status(500).json({ error: 'server error' });
  }
});
// Fetch messages for a conversation (DB-backed)
app.get('/api/conversations/:id/messages', async (req, res) => {
  const convId = req.params.id;
  try {
    const rowsRes = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at DESC', [convId]);
    const rows = (rowsRes && rowsRes.rows) ? rowsRes.rows : [];

    let convUserId = null;
    try{ const cres = await pool.query('SELECT user_id FROM conversations WHERE id = $1 LIMIT 1', [convId]); if(cres && cres.rows && cres.rows[0]) convUserId = cres.rows[0].user_id; }catch(e){}

    // If there is a conversation-level user id, try to load the user record for nicer display
    let convUser = null;
    if(convUserId){
      try{ const ur = await pool.query('SELECT id, username, email, full_name, avatar_url FROM users WHERE id = $1 LIMIT 1', [convUserId]); if(ur && ur.rows && ur.rows[0]) convUser = ur.rows[0]; }catch(e){}
    }

    const mapped = rows.map(r => {
      let meta = null;
      try{ meta = (typeof r.meta === 'string') ? JSON.parse(r.meta) : r.meta; }catch(e){ meta = r.meta || null }
      if(!meta && r.content && typeof r.content === 'string'){
        try{ const parsed = JSON.parse(r.content); if(parsed && typeof parsed === 'object') meta = parsed; }catch(e){}
      }
      const text = r.body || r.content || r.message || (meta && (meta.text || meta.body)) || null;
      const ts = r.sent_at || r.sentAt || r.created_at || null;
      let sender = null;
      try{
        if(r.sender && (String(r.sender).toLowerCase() === 'admin' || String(r.sender).toLowerCase() === 'user')) sender = String(r.sender).toLowerCase();
        else if(r.sender_id && convUserId && String(r.sender_id) === String(convUserId)) sender = 'user';
        else if(r.sender_id && convUserId && String(r.sender_id) !== String(convUserId)) sender = 'admin';
        else if(meta && meta.sender) sender = String(meta.sender).toLowerCase();
        else sender = (r.sender || null);
      }catch(e){ sender = (r.sender || null); }
      try{ if(meta && typeof meta === 'string') meta = JSON.parse(meta); }catch(e){}
      return {
        id: r.id,
        sender: sender || (r.sender_id ? 'user' : 'user'),
        text: text,
        timestamp: ts,
        userId: r.sender_id || (meta && (meta.userId || meta.user_id)) || null,
        userName: (meta && (meta.userName || meta.user_name)) || r.user_name || r.userName || (convUser ? (convUser.full_name || convUser.username || convUser.email) : null),
        userEmail: (meta && (meta.userEmail || meta.user_email)) || r.user_email || r.email || (convUser ? convUser.email : null),
        meta: meta || null
      };
    });

    let convProperty = null;
    try{
      const m = String(convId).match(/^property-(\d+)/i);
      if(m){
        const pid = parseInt(m[1],10);
        const pres = await pool.query('SELECT id, title, image_url, images FROM properties WHERE id = $1 LIMIT 1', [pid]);
        if(pres && pres.rows && pres.rows[0]) convProperty = pres.rows[0];
      }
    }catch(e){}

    return res.json({ messages: mapped, property: convProperty });
  } catch (err) {
    res.status(500).json({ error: 'Database error fetching conversation messages', details: err.message });
  }
});

// Optional utility: attempt to retrofit legacy message rows by parsing `content` JSON
// This is gated by ALLOW_MESSAGE_RETROFIT=true in environment to avoid accidental writes.
app.post('/api/messages/retrofit-meta', async (req, res) => {
  if (String(process.env.ALLOW_MESSAGE_RETROFIT) !== 'true') return res.status(403).json({ error: 'Retrofit disabled. Set ALLOW_MESSAGE_RETROFIT=true to enable.' });
  try {
    // Find candidate rows: meta IS NULL and content looks non-empty
    const candidates = await pool.query("SELECT id, content FROM messages WHERE (meta IS NULL OR meta = '') AND content IS NOT NULL LIMIT 1000");
    const rows = candidates.rows || [];
    const updated = [];
    for (const r of rows) {
      if (!r.content || typeof r.content !== 'string') continue;
      try {
        const parsed = JSON.parse(r.content);
        if (parsed && typeof parsed === 'object') {
          try {
            await pool.query('UPDATE messages SET meta = $1 WHERE id = $2', [JSON.stringify(parsed), r.id]);
            // if parsed.sender is present, try to persist into sender column too
            if (parsed.sender) {
              try { await pool.query('UPDATE messages SET sender = $1 WHERE id = $2', [parsed.sender, r.id]); } catch (e) { }
            }
            updated.push(r.id);
          } catch (e) { /* ignore individual update failures */ }
        }
      } catch (e) { /* not JSON */ }
    }
    return res.json({ updatedCount: updated.length, updatedIds: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Retrofit failed', details: err.message });
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
    // Diagnostic: log DB and schema information before creating property
    try{
      const info = await pool.query("SELECT current_database() AS db, current_schema() AS schema");
      if(info && info.rows && info.rows[0]) console.log('[api-prop-dbg] DB before insert:', info.rows[0]);
    }catch(e){ console.warn('[api-prop-dbg] failed to query DB info before insert', e && e.message ? e.message : e); }
    console.log('[api-prop-dbg] creating property title:', (property && property.title) ? property.title : '(no title)');
    const resObj = await addPropertyWithPhotos(property, photoUrls);
    // Diagnostic: log DB info after insert and the returned object
    try{
      const info2 = await pool.query("SELECT current_database() AS db, current_schema() AS schema");
      if(info2 && info2.rows && info2.rows[0]) console.log('[api-prop-dbg] DB after insert:', info2.rows[0]);
    }catch(e){ console.warn('[api-prop-dbg] failed to query DB info after insert', e && e.message ? e.message : e); }
    console.log('[api-prop-dbg] insert result:', (resObj && (resObj.propertyId || (resObj.property && resObj.property.id))) ? (resObj.propertyId || (resObj.property && resObj.property.id)) : resObj );
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
  const { username, email, password, full_name, location } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, location) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, full_name, role, created_at, location",
      [username, email, hash, full_name || null, location || null]
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

// Update current user's profile (safely update only existing columns)
app.post('/api/me', async (req, res) => {
  try {
    const sess = await getSessionUser(req);
    if (!sess || !sess.id) return res.status(401).json({ error: 'Not authenticated' });
    const userId = sess.id;
    const allowed = ['full_name','username','email','location','avatar_url','phone','bio'];
    const provided = Object.keys(req.body || {}).filter(k => allowed.indexOf(k) !== -1);
    if (provided.length === 0) return res.status(400).json({ error: 'No updatable fields provided' });

    // Determine which columns actually exist in the `users` table
    const colsRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = ANY($1::text[])`,
      [allowed]
    );
    const existing = (colsRes.rows || []).map(r => r.column_name);
    const toUpdate = provided.filter(p => existing.indexOf(p) !== -1);
    if (toUpdate.length === 0) return res.status(400).json({ error: 'No writable columns exist on DB' });

    const sets = toUpdate.map((c, idx) => `${c} = $${idx+1}`);
    const values = toUpdate.map(c => req.body[c] === undefined ? null : req.body[c]);
    const sql = `UPDATE users SET ${sets.join(', ')} WHERE id = $${toUpdate.length + 1} RETURNING id, username, email, full_name, role, created_at, location, avatar_url, phone, bio`;
    const result = await pool.query(sql, [...values, userId]);
    if (result.rows && result.rows[0]) return res.json({ user: result.rows[0] });
    return res.status(500).json({ error: 'Failed to update user' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Logout: clear session cookie
app.post('/api/logout', async (req, res) => {
  try {
    // Clear both user and admin session cookies
    res.cookie('wispa_session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 0 });
    res.cookie('wispa_admin_session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 0 });
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
    // Authenticate only against admin_logins (admin-specific accounts)
    const result = await pool.query("SELECT * FROM admin_logins WHERE username = $1 OR email = $1", [username]);
    if (result.rows.length === 0) {
      console.warn('[admin-login] no admin user found for', username);
      return res.status(401).json({ error: "Invalid credentials or not an admin" });
    }
    const admin = result.rows[0];
    const pwHash = admin.password_hash || '';
    const match = await bcrypt.compare(password, pwHash);
    if (!match) {
      console.warn('[admin-login] password mismatch for user', username, 'id', admin.id);
      return res.status(401).json({ error: "Invalid credentials or not an admin" });
    }
    // Create admin session cookie only
    try{
      const token = createSessionToken(admin.id);
      const isSecureLocal = (req.protocol === 'https') || (process.env.NODE_ENV === 'production');
      const cookieOpts = { httpOnly: true, sameSite: isSecureLocal ? 'none' : 'lax', secure: isSecureLocal, maxAge: 7*24*3600*1000 };
      res.cookie('wispa_admin_session', token, cookieOpts);
    }catch(e){ /* ignore cookie set errors */ }
    const respUser = { id: admin.id, username: admin.username || admin.email, email: admin.email || null, full_name: admin.full_name || admin.fullName || 'Administrator', role: 'admin', created_at: admin.created_at };
    if (typeof admin.verified !== 'undefined') respUser.verified = !!admin.verified;
    res.json({ user: respUser, source: 'admin_logins' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin login redirect flow for cross-origin login: returns a URL on the API host
app.post('/api/admin-login-redirect', async (req, res) => {
  const { username, password, returnTo } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    // Authenticate only against admin_logins
    const result = await pool.query("SELECT * FROM admin_logins WHERE username = $1 OR email = $1", [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const admin = result.rows[0];
    const pwHash = admin.password_hash || '';
    const match = await bcrypt.compare(password, pwHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
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
    // Determine whether token belongs to an admin; check admin_logins OR users.role='admin'
      // Determine whether token belongs to an admin in admin_logins only
      let isAdmin = false;
      try{
        const a = await pool.query('SELECT id FROM admin_logins WHERE id = $1', [payload.uid]);
        if(a && a.rows && a.rows[0]) isAdmin = true;
      }catch(e){}
      const isSecure2 = (req.protocol === 'https') || (process.env.NODE_ENV === 'production');
      const cookieOpts = { httpOnly: true, sameSite: isSecure2 ? 'none' : 'lax', secure: isSecure2, maxAge: (payload.exp - Math.floor(Date.now()/1000)) * 1000 };
      if(isAdmin) {
        res.cookie('wispa_admin_session', st, cookieOpts);
      } else {
        res.cookie('wispa_session', st, cookieOpts);
      }
    return res.redirect(r);
  } catch (e) { return res.status(500).send('Failed to set session'); }
});


// Get all users
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, email, full_name, role, created_at, avatar_url, location FROM users ORDER BY created_at DESC");
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

// Debug: fetch a single property by id (helps confirm read visibility)
app.get('/api/properties/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    const pRes = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
    if (!pRes.rows || pRes.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    const prop = pRes.rows[0];
    try {
      const photosRes = await pool.query('SELECT photo_url FROM property_photos WHERE property_id = $1', [id]);
      prop.images = photosRes.rows.map(r => r.photo_url).filter(Boolean);
    } catch (e) { /* ignore photo fetch errors */ }
    if (!prop.location && prop.address) prop.location = prop.address;
    return res.json({ property: prop });
  } catch (err) {
    return res.status(500).json({ error: 'Database error fetching property', details: err.message });
  }
});

// Debug: recent properties summary (limited) to help inspect DB visibility
app.get('/api/debug/properties-recent', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, title, address, price, created_at FROM properties ORDER BY created_at DESC LIMIT 200');
    return res.json({ recent: r.rows || [] });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch recent properties', details: e.message });
  }
});

// Debug: basic DB info and existence check
app.get('/api/debug/db-info', async (req, res) => {
  try {
    const now = await pool.query("SELECT NOW() as now");
    const exists = await pool.query("SELECT to_regclass('public.properties') as exists");
    return res.json({ now: now.rows && now.rows[0] && now.rows[0].now, properties_table: exists.rows && exists.rows[0] && exists.rows[0].exists });
  } catch (e) {
    return res.status(500).json({ error: 'DB info failed', details: e.message });
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
