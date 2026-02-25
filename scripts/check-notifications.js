#!/usr/bin/env node
// scripts/check-notifications.js
// Verifies if the `notifications` table exists

const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const connectionString = process.argv[2] || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Provide DATABASE_URL via env or as first arg');
    process.exit(2);
  }
  const shouldUseSsl = (process.env.NODE_ENV === 'production') || (connectionString && String(connectionString).includes('render.com'));
  const pool = new Pool({ connectionString, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  try {
    const r = await client.query("SELECT to_regclass('public.notifications') AS exists");
    console.log('to_regclass result:', r.rows[0]);
    if (r.rows[0] && r.rows[0].exists) {
      console.log('notifications table exists:', r.rows[0].exists);
      process.exit(0);
    } else {
      console.error('notifications table not found');
      process.exit(1);
    }
  } catch (e) {
    console.error('Check failed:', e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
