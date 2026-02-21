import fs from 'fs';
import { Pool } from 'pg';

const outPath = './data/duplicate-preview.json';
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set. Set $Env:DATABASE_URL and rerun.');
  process.exit(2);
}

const pool = new Pool({ connectionString: dbUrl, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

async function run() {
  const client = await pool.connect();
  try {
    const q = `
      SELECT key, count(*) as cnt, json_agg(json_build_object('id', id, 'title', title, 'address', address, 'price', price, 'created_at', created_at)) AS items
      FROM (
        SELECT id, title, address, price, created_at,
        lower(regexp_replace(coalesce(title,''),'\\s+',' ','g')) || '::' || lower(regexp_replace(coalesce(address,''),'\\s+',' ','g')) || '::' || coalesce(price::text,'') AS key
        FROM properties
      ) t
      GROUP BY key
      HAVING count(*) > 1
      ORDER BY cnt DESC
      LIMIT 200
    `;
    const res = await client.query(q);
    const out = { found: res.rowCount, groups: res.rows };
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log('Wrote', outPath, 'groups=', res.rowCount);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
