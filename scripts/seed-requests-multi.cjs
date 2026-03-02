#!/usr/bin/env node
// scripts/seed-requests-multi.cjs
// Inserts multiple sample requests into the `requests` table with varied data
const { Pool } = require('pg');
require('dotenv').config();

async function main(){
  const connectionString = process.argv[2] || process.env.DATABASE_URL;
  if(!connectionString){
    console.error('Provide DATABASE_URL via env or as first arg');
    process.exit(2);
  }
  const pool = new Pool({ connectionString, ssl: (connectionString.includes('render.com')) ? { rejectUnauthorized: false } : false });
  const client = await pool.connect();
  try{
    const now = new Date();
    const samples = [
      { user_id: 1, property_id: 10, request_type: 'inquiry', status: 'pending', payload: { msg: 'Is this still available?' } },
      { user_id: 2, property_id: 11, request_type: 'visit', status: 'scheduled', payload: { date: new Date(now.getTime()+86400000).toISOString() } },
      { user_id: null, property_id: 12, request_type: 'inquiry', status: 'pending', payload: { via: 'guest' } },
      { user_id: 3, property_id: null, request_type: 'support', status: 'open', payload: { issue: 'Listing details incorrect' } },
      { user_id: 4, property_id: 13, request_type: 'offer', status: 'submitted', payload: { amount: 120000 } }
    ];
    const inserted = [];
    for(const s of samples){
      const createdAt = new Date().toISOString();
      try{
        const r = await client.query('INSERT INTO requests (user_id, property_id, request_type, status, payload, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [s.user_id, s.property_id, s.request_type, s.status, JSON.stringify(s.payload), createdAt, createdAt]);
        inserted.push(r.rows[0]);
      }catch(err){
        // If foreign key constraint on user_id or property_id fails, retry with null user_id and null property_id
        if(err && String(err.message).toLowerCase().includes('foreign key')){
          const r2 = await client.query('INSERT INTO requests (user_id, property_id, request_type, status, payload, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [null, null, s.request_type, s.status, JSON.stringify(s.payload), createdAt, createdAt]);
          inserted.push(r2.rows[0]);
        } else {
          throw err;
        }
      }
    }
    console.log('Inserted requests:', inserted.map(i=>i.id));
  }catch(e){ console.error('seed-requests-multi failed', e && e.message ? e.message : e); process.exitCode = 1; }
  finally{ client.release(); await pool.end(); }
}

main().catch(e=>{ console.error(e); process.exit(1); });
