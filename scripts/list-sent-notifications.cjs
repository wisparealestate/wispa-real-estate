#!/usr/bin/env node
require('dotenv').config();
const pkg = require('pg');
const { Pool } = pkg;
const shouldUseSsl = (process.env.NODE_ENV === 'production') || (process.env.DATABASE_URL && String(process.env.DATABASE_URL).includes('render.com'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
(async()=>{
  try{
    const r = await pool.query('SELECT id, to_user_id, channel, payload, success, sent_at FROM sent_notifications ORDER BY sent_at DESC LIMIT 10');
    console.log(JSON.stringify(r.rows, null, 2));
  }catch(e){ console.error('Failed to query sent_notifications:', e && e.message ? e.message : e); process.exit(2); }
  finally{ pool.end(); }
})();
