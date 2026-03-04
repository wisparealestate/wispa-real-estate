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
    try{
      const data = JSON.stringify(out, null, 2);
      // backup existing
      try{ if(fs.existsSync(outPath)) fs.copyFileSync(outPath, outPath + '.bak.' + Date.now()); }catch(_){ }
      const tmp = outPath + `.tmp.${Math.random().toString(36).slice(2,8)}`;
      fs.writeFileSync(tmp, data, 'utf8');
      fs.renameSync(tmp, outPath);
      console.log('Wrote', outPath, 'groups=', res.rowCount);
    }catch(e){ console.error('Failed to write', outPath, e && e.message ? e.message : e); throw e; }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
