const { Pool } = require('pg');
(async ()=>{
  const DATABASE_URL = process.env.DATABASE_URL;
  if(!DATABASE_URL){ console.error('Missing DATABASE_URL'); process.exit(1); }
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try{
    const q = "UPDATE users SET role='user' WHERE role='admin' RETURNING id, username, email";
    const r = await pool.query(q);
    console.log('demoted users:', JSON.stringify(r.rows, null, 2));
  }catch(e){ console.error('ERROR', e && e.message); process.exit(1); } finally{ await pool.end(); }
})();
