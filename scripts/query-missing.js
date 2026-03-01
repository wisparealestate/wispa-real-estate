import { Pool } from 'pg';
(async()=>{
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try{
    const ids = [17730840,23031102,97538888,99409368];
    const props = await pool.query('SELECT id,title,image_url,images,post_to,user_id,created_at FROM properties WHERE id = ANY($1::int[])', [ids]);
    console.log('PROPERTIES:', JSON.stringify(props.rows, null, 2));
  }catch(e){ console.error(e && e.stack ? e.stack : e); process.exit(1); } finally { await pool.end(); }
})();
