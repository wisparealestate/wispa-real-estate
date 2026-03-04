#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
(function(){ const dotenvPath = path.resolve(__dirname, '..', '.env'); if(fs.existsSync(dotenvPath)){ const env = fs.readFileSync(dotenvPath,'utf8').split(/\r?\n/).filter(Boolean).map(l=>l.trim()).filter(l=>!l.startsWith('#')); env.forEach(line=>{ const idx=line.indexOf('='); if(idx>0){ const k=line.slice(0,idx); const v=line.slice(idx+1); if(!process.env[k]) process.env[k]=v; } }); }
})();
const pg = require('pg');
const { Pool } = pg;
const shouldUseSsl = (process.env.NODE_ENV === 'production') || (process.env.DATABASE_URL && String(process.env.DATABASE_URL).includes('render.com'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
(async function(){ try{
  const q = await pool.query("SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'properties' ORDER BY ordinal_position");
  console.log('properties columns:');
  console.table(q.rows);
  await pool.end();
}catch(e){ console.error('error', e.message); process.exit(1); } })();
