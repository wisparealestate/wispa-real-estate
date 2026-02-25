#!/usr/bin/env node
// apply-migration.cjs
// Usage: node scripts/apply-migration.cjs path/to/migration.sql [DATABASE_URL]

const fs = require('fs').promises;
const { Pool } = require('pg');
require('dotenv').config();

async function main(){
  const sqlPath = process.argv[2];
  const altConn = process.argv[3];
  if(!sqlPath){
    console.error('Usage: node scripts/apply-migration.cjs path/to/migration.sql [DATABASE_URL]');
    process.exit(2);
  }
  const connectionString = altConn || process.env.DATABASE_URL || process.env.DB_URL;
  if(!connectionString){
    console.error('No DATABASE_URL found. Provide it via env or as second argument.');
    process.exit(3);
  }
  const shouldUseSsl = (process.env.NODE_ENV === 'production') || (connectionString && String(connectionString).includes('render.com'));
  const pool = new Pool({ connectionString, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  try{
    const sql = await fs.readFile(sqlPath, 'utf8');
    console.log('Applying migration from', sqlPath);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration applied successfully.');
  }catch(e){
    try{ await client.query('ROLLBACK'); }catch(_){}
    console.error('Migration failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }finally{
    client.release();
    await pool.end();
  }
}

main().catch(e=>{ console.error('Fatal:', e && e.message ? e.message : e); process.exit(1); });
