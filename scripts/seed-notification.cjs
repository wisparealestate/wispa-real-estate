#!/usr/bin/env node
// scripts/seed-notification.cjs
// Inserts a sample notification and prints it

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
      category: 'alerts',
      title: 'Test Alert from Seeder',
      body: 'This is a test alert created by scripts/seed-notification.cjs',
      target: null,
      data: { test: true },
      is_read: false,
      created_at: createdAt,
      updated_at: createdAt
    };
    // Prefer to insert into specialized tables when appropriate
    let inserted = null;
    if(sample.category === 'alerts'){
      const r = await client.query('INSERT INTO alerts (user_id, type, payload, read, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *', [null, 'seed', JSON.stringify(sample.data), sample.is_read, sample.created_at]);
      inserted = r.rows[0];
      console.log('Inserted alert:', inserted);
    } else {
      try{
        const insert = await client.query(
          `INSERT INTO notifications (category, title, body, target, data, is_read, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [sample.category, sample.title, sample.body, sample.target, JSON.stringify(sample.data), sample.is_read, sample.created_at, sample.updated_at]
        );
        inserted = insert.rows[0];
        console.log('Inserted notification:', inserted);
      }catch(e){
        // Fallback: write into sent_notifications as a record of the event
        const r = await client.query('INSERT INTO sent_notifications (to_user_id, channel, payload, success, sent_at) VALUES ($1,$2,$3,$4,$5) RETURNING *', [null, 'seed', JSON.stringify(sample), true, sample.created_at]);
        inserted = r.rows[0];
        console.log('Inserted into sent_notifications as fallback:', inserted);
      }
    }

    console.log('Seed completed. Inserted record id:', inserted && inserted.id ? inserted.id : '(unknown)');

  }catch(e){
    console.error('Seed failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }finally{
    client.release();
    await pool.end();
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
