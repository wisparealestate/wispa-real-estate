#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Load .env if present
const dotenvPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
  const env = fs.readFileSync(dotenvPath, 'utf8').split(/\r?\n/).filter(Boolean).map(l=>l.trim()).filter(l=>!l.startsWith('#'));
  env.forEach(line => {
    const idx = line.indexOf('='); if(idx>0){ const k=line.slice(0,idx); const v=line.slice(idx+1); if(!process.env[k]) process.env[k]=v; }
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
if(!DATABASE_URL){ console.error('DATABASE_URL not set in environment or .env'); process.exit(2); }

(async function(){
  const client = new Client({ connectionString: DATABASE_URL });
  try{
    await client.connect();
    const res = await client.query(`SELECT id, title, address, price, post_to, created_at, updated_at FROM properties ORDER BY created_at DESC NULLS LAST LIMIT 25`);
    if(!res || !res.rows) { console.log('No rows returned'); process.exit(0); }
    console.log('Recent properties (most recent first):');
    for(const r of res.rows){
      console.log(`${r.id}\t${r.title||''}\t${r.address||''}\tprice:${r.price||''}\tpost_to:${r.post_to||''}\tcreated:${r.created_at||r.updated_at||''}`);
    }
    process.exit(0);
  }catch(e){ console.error('Query failed', e); process.exit(3); }
  finally{ try{ await client.end(); }catch(e){} }
})();
