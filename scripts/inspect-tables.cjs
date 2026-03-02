#!/usr/bin/env node
// inspect-tables.cjs - inspect conversations/messages tables and constraints
const { Pool } = require('pg');
require('dotenv').config();
(async function(){
  const cs = process.env.DATABASE_URL || process.env.DB_URL;
  if(!cs){ console.error('No DATABASE_URL'); process.exit(2); }
  const pool = new Pool({ connectionString: cs, ssl: (process.env.NODE_ENV==='production' || String(cs).includes('render.com')) ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  try{
    const tbl = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('conversations','messages')");
    console.log('tables:', tbl.rows.map(r=>r.table_name));
    const cols = await client.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('conversations','messages') ORDER BY table_name,column_name");
    console.log('columns:'); console.log(cols.rows);
    const fk = await client.query("SELECT conname, conrelid::regclass AS table_from, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text IN ('messages','conversations')");
    console.log('fks:', fk.rows);
  }catch(e){ console.error('ERR', e && e.message ? e.message : e); }
  finally{ client.release(); await pool.end(); }
})();
