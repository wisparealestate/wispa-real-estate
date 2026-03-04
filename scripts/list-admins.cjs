#!/usr/bin/env node
const pkg = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Pool } = pkg;
const shouldUseSsl = (process.env.NODE_ENV === 'production') || (process.env.DATABASE_URL && String(process.env.DATABASE_URL).includes('render.com'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
(async()=>{
  try{
    const r = await pool.query('SELECT id, username, email, created_at FROM admin_logins ORDER BY created_at DESC LIMIT 50');
    console.log(JSON.stringify(r.rows, null, 2));
  }catch(e){
    console.error('Failed to query admin_logins:', e && e.message ? e.message : e);
    process.exit(2);
  }finally{ pool.end(); }
})();
