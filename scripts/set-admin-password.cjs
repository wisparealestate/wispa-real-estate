#!/usr/bin/env node
require('dotenv').config();
const pkg = require('pg');
const bcrypt = require('bcrypt');
const { Pool } = pkg;
const shouldUseSsl = (process.env.NODE_ENV === 'production') || (process.env.DATABASE_URL && String(process.env.DATABASE_URL).includes('render.com'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });

(async()=>{
  try{
    const target = process.argv[2] || process.env.ADMIN_USER || process.env.ADMIN_EMAIL || 'admin';
    const pass = process.argv[3] || process.env.ADMIN_PASS || 'Secret123';
    const hash = await bcrypt.hash(pass, 10);
    // If target looks numeric, update by id; otherwise by username or email
    let res;
    if(/^[0-9]+$/.test(String(target))){
      res = await pool.query('UPDATE admin_logins SET password_hash = $1 WHERE id = $2 RETURNING id, username, email', [hash, Number(target)]);
    }else{
      res = await pool.query('UPDATE admin_logins SET password_hash = $1 WHERE username = $2 OR email = $2 RETURNING id, username, email', [hash, target]);
    }
    if(res && res.rows && res.rows[0]){
      console.log('Password set for admin:', res.rows[0]);
    }else{
      console.error('No admin row matched', target);
      process.exit(2);
    }
  }catch(e){ console.error('Failed to set admin password:', e && e.message ? e.message : e); process.exit(2); }
  finally{ await pool.end(); }
})();
