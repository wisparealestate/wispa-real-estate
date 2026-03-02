#!/usr/bin/env node
// scripts/seed-activities-multi.cjs
// Inserts multiple sample activities into the `activities` table with varied types
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
      { user_id: 1, activity_type: 'property_view', target_type: 'property', target_id: 10, payload: { viewedFrom: 'search' } },
      { user_id: 2, activity_type: 'favorite', target_type: 'property', target_id: 11, payload: { action: 'liked' } },
      { user_id: null, activity_type: 'system_backup', target_type: 'system', target_id: null, payload: { ok: true } },
      { user_id: 3, activity_type: 'profile_update', target_type: 'user', target_id: 3, payload: { changed: ['bio'] } },
      { user_id: 4, activity_type: 'property_share', target_type: 'property', target_id: 13, payload: { via: 'email' } }
    ];
    const inserted = [];
    for(const s of samples){
      const createdAt = new Date().toISOString();
      try{
        const r = await client.query('INSERT INTO activities (user_id, activity_type, target_type, target_id, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [s.user_id, s.activity_type, s.target_type, s.target_id, JSON.stringify(s.payload), createdAt]);
        inserted.push(r.rows[0]);
      }catch(err){
        // Retry with null user_id if FK constraint fails
        if(err && String(err.message).toLowerCase().includes('foreign key')){
          const r2 = await client.query('INSERT INTO activities (user_id, activity_type, target_type, target_id, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [null, s.activity_type, s.target_type, s.target_id, JSON.stringify(s.payload), createdAt]);
          inserted.push(r2.rows[0]);
        } else {
          throw err;
        }
      }
    }
    console.log('Inserted activities:', inserted.map(i=>i.id));
  }catch(e){ console.error('seed-activities-multi failed', e && e.message ? e.message : e); process.exitCode = 1; }
  finally{ client.release(); await pool.end(); }
}

main().catch(e=>{ console.error(e); process.exit(1); });
