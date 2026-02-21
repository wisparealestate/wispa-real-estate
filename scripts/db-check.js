import pkg from 'pg';

(async function(){
  try{
    const { Pool } = pkg;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
    const r = await pool.query("SELECT * FROM conversations WHERE id = $1", ['property-99999']);
    console.log('conversations rows:', r.rows);
    const r2 = await pool.query("SELECT * FROM conversations ORDER BY updated DESC LIMIT 10");
    console.log('recent convs:', r2.rows);
    await pool.end();
  }catch(e){ console.error('db-check error', e && e.stack ? e.stack : e); process.exit(1); }
})();
