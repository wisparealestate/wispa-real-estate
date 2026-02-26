const { Pool } = require('pg');

(async function(){
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try{
    const title = 'TEST INSERT ' + Date.now();
    const insertRes = await pool.query(
      'INSERT INTO properties (title, address, price, post_to, created_at, updated_at) VALUES ($1,$2,$3,$4,now(),now()) RETURNING id, title, address, price',
      [title, '123 Test St', 12345, 'web']
    );
    console.log('inserted:', insertRes.rows[0]);
    const id = insertRes.rows[0].id;
    const selectRes = await pool.query('SELECT id,title,address,price FROM properties WHERE id = $1', [id]);
    console.log('read back:', selectRes.rows[0]);
    await pool.query('DELETE FROM properties WHERE id = $1', [id]);
    console.log('deleted test row id', id);
    await pool.end();
    process.exit(0);
  }catch(e){
    console.error('insert test failed', e && e.stack ? e.stack : e);
    try{ await pool.end(); }catch(_){}
    process.exit(1);
  }
})();
