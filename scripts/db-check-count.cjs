require('dotenv').config();
const { Pool } = require('pg');
(async ()=>{
  try{
    const connectionString = process.env.DATABASE_URL;
    if(!connectionString){ console.error('No DATABASE_URL in env'); process.exit(2); }
    const pool = new Pool({ connectionString, ssl: (process.env.NODE_ENV === 'production' || (String(connectionString).includes('render.com'))) ? { rejectUnauthorized: false } : false });
    const r = await pool.query('SELECT count(*) AS cnt FROM public.properties');
    console.log('DB count:', r.rows && r.rows[0] && r.rows[0].cnt);
    const recent = await pool.query('SELECT id, title, address, price, created_at FROM public.properties ORDER BY created_at DESC LIMIT 200');
    console.log('Recent rows:', recent.rows.length);
    if(recent.rows && recent.rows.length){ console.log(recent.rows.slice(0,10)); }
    await pool.end();
    process.exit(0);
  }catch(e){ console.error('DB check failed', e && e.message ? e.message : e); process.exit(1); }
})();
