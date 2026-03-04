#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
(function(){ const dotenvPath = path.resolve(__dirname, '..', '.env'); if(fs.existsSync(dotenvPath)){ const env = fs.readFileSync(dotenvPath,'utf8').split(/\r?\n/).filter(Boolean).map(l=>l.trim()).filter(l=>!l.startsWith('#')); env.forEach(line=>{ const idx=line.indexOf('='); if(idx>0){ const k=line.slice(0,idx); const v=line.slice(idx+1); if(!process.env[k]) process.env[k]=v; } }); }
})();
const pg = require('pg');
const { Pool } = pg;
const shouldUseSsl = (process.env.NODE_ENV === 'production') || (process.env.DATABASE_URL && String(process.env.DATABASE_URL).includes('render.com'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
(async function(){ try{
  await pool.connect();
  const ids = [11,18,1,2,3,11];
  for(const id of ids){
    try{ const r = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [id]); console.log('users id', id, 'rows:', r.rows.length ? r.rows : 'none'); }catch(e){ console.error('query users failed for', id, e.message); }
    try{ const r2 = await pool.query('SELECT id, username, email FROM admin_logins WHERE id = $1', [id]); console.log('admin id', id, 'rows:', r2.rows.length ? r2.rows : 'none'); }catch(e){ console.error('query admin failed for', id, e.message); }
  }
  await pool.end();
}catch(e){ console.error('error', e.message); process.exit(1); } })();
