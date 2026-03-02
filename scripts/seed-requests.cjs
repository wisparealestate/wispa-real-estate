#!/usr/bin/env node
// scripts/seed-requests.cjs
// Inserts a sample request into the `requests` table
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
      property_id: null,
      request_type: 'inquiry',
      status: 'pending',
      payload: { test: true, note: 'Seed request' },
      created_at: createdAt,
      updated_at: createdAt
    };
    const r = await client.query('INSERT INTO requests (user_id, property_id, request_type, status, payload, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [sample.user_id, sample.property_id, sample.request_type, sample.status, JSON.stringify(sample.payload), sample.created_at, sample.updated_at]);
    console.log('Inserted request:', r.rows[0]);
    console.log('Seed completed. Inserted request id:', r.rows[0] && r.rows[0].id ? r.rows[0].id : '(unknown)');
  }catch(e){
    console.error('Seed requests failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }finally{
    client.release();
    await pool.end();
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
