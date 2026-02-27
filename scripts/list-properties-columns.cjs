const { Pool } = require('pg');

(async function(){
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try{
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='properties' ORDER BY ordinal_position");
    console.log(r.rows.map(r=>r.column_name).join('\n'));
    await pool.end();
    process.exit(0);
  }catch(e){
    console.error(e && e.stack ? e.stack : e);
    try{ await pool.end(); }catch(_){}
    process.exit(1);
  }
})();
