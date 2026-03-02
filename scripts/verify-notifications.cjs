#!/usr/bin/env node
// scripts/verify-notifications.cjs
// Queries the new notification tables and prints recent rows
const { Pool } = require('pg');
require('dotenv').config();

async function q(pool, sql, params){
  try{ const r = await pool.query(sql, params||[]); return r.rows; }catch(e){ console.error('Query failed', sql, e.message||e); return null; }
}

async function main(){
  const connectionString = process.argv[2] || process.env.DATABASE_URL;
  if(!connectionString){ console.error('Provide DATABASE_URL via env or as first arg'); process.exit(2); }
  const pool = new Pool({ connectionString, ssl: (connectionString.includes('render.com')) ? { rejectUnauthorized: false } : false });
  try{
    console.log('Recent alerts:');
    const alerts = await q(pool, 'SELECT id, user_id, type, payload, read, created_at FROM alerts ORDER BY created_at DESC LIMIT 5');
    console.log(alerts);
    console.log('\nRecent requests:');
    const requests = await q(pool, 'SELECT id, user_id, property_id, request_type, status, payload, created_at FROM requests ORDER BY created_at DESC LIMIT 5');
    console.log(requests);
    console.log('\nRecent activities:');
    const activities = await q(pool, 'SELECT id, user_id, activity_type, payload, created_at FROM activities ORDER BY created_at DESC LIMIT 5');
    console.log(activities);
    console.log('\nRecent sent_notifications:');
    const sent = await q(pool, 'SELECT id, to_user_id, channel, payload, success, sent_at FROM sent_notifications ORDER BY sent_at DESC LIMIT 5');
    console.log(sent);
  }catch(e){ console.error('Verify failed', e && e.message ? e.message : e); process.exitCode = 1; }
  finally{ await pool.end(); }
}

main().catch(e=>{ console.error(e); process.exit(1); });
