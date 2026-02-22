const { Pool } = require('pg');
const bcrypt = require('bcrypt');

async function run(){
  const DATABASE_URL = process.env.DATABASE_URL;
  if(!DATABASE_URL){ console.error('Missing DATABASE_URL'); process.exit(1); }
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try{
    const newEmail = process.env.NEW_ADMIN_EMAIL || 'admin@wispa.test';
    const newPassword = process.env.NEW_ADMIN_PASSWORD || 'WispaAdmin#2026!';
    const username = process.env.ADMIN_USERNAME || 'admin';
    console.log('Hashing password...');
    const hash = await bcrypt.hash(newPassword, 12);
    const q = 'UPDATE admin_logins SET email=$1, password_hash=$2 WHERE username=$3 RETURNING id, username, email, created_at';
    const res = await pool.query(q, [newEmail, hash, username]);
    if(res.rows.length){
      console.log('Admin updated:', JSON.stringify(res.rows[0]));
    } else {
      console.log('No admin row updated.');
    }
  }catch(e){
    console.error('ERROR', e && e.message);
    process.exit(1);
  }finally{
    await pool.end();
  }
}
run();
