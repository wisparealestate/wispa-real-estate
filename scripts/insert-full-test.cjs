const { Pool } = require('pg');

(async function(){
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try{
    const now = new Date();
    const title = 'FULL TEST INSERT ' + Date.now();
    const values = [
      null, // user_id
      title,
      'This is a full-field insert test',
      99999.99,
      '456 Full St',
      'https://example.com/image.jpg',
      now,
      3, // bedrooms
      2, // bathrooms
      'house',
      1500, // area
      'sale',
      'web'
    ];

    const insertSql = `INSERT INTO properties (user_id, title, description, price, address, image_url, created_at, bedrooms, bathrooms, type, area, sale_rent, post_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, title, price, address`;
    const insertRes = await pool.query(insertSql, values);
    console.log('inserted full:', insertRes.rows[0]);
    const id = insertRes.rows[0].id;
    const selectRes = await pool.query('SELECT id,user_id,title,description,price,address,image_url,bedrooms,bathrooms,type,area,sale_rent,post_to FROM properties WHERE id = $1', [id]);
    console.log('read back full:', selectRes.rows[0]);
    await pool.query('DELETE FROM properties WHERE id = $1', [id]);
    console.log('deleted test row id', id);
    await pool.end();
    process.exit(0);
  }catch(e){
    console.error('full insert test failed', e && e.stack ? e.stack : e);
    try{ await pool.end(); }catch(_){}
    process.exit(1);
  }
})();
