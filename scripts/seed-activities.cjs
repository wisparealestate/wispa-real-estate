#!/usr/bin/env node
// scripts/seed-activities.cjs
// Inserts a sample activity into the `activities` table
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
    const createdAt = new Date().toISOString();
    const sample = {
      user_id: null,
      activity_type: 'seed_activity',
      target_type: 'property',
      target_id: null,
      payload: { test: true, note: 'Seed activity' },
      created_at: createdAt
    };
    const r = await client.query('INSERT INTO activities (user_id, activity_type, target_type, target_id, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [sample.user_id, sample.activity_type, sample.target_type, sample.target_id, JSON.stringify(sample.payload), sample.created_at]);
    console.log('Inserted activity:', r.rows[0]);
    console.log('Seed completed. Inserted activity id:', r.rows[0] && r.rows[0].id ? r.rows[0].id : '(unknown)');
  }catch(e){
    console.error('Seed activities failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }finally{
    client.release();
    await pool.end();
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
