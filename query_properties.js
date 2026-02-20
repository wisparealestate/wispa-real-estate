import fs from 'fs';
import { Pool } from 'pg';

// Read DATABASE_URL from .env
const env = fs.readFileSync('.env','utf8');
const m = env.match(/DATABASE_URL=(.+)/);
if(!m){
  console.error('No DATABASE_URL found in .env');
  process.exit(2);
}
const connectionString = m[1].trim();

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

(async ()=>{
  try{
    const r = await pool.query("SELECT id, title, price, address, city, state, zip_code, created_at FROM properties ORDER BY created_at DESC LIMIT 20");
    console.log(JSON.stringify(r.rows, null, 2));
  }catch(err){
    console.error('Query failed:', err.message || err);
    process.exitCode = 1;
  }finally{
    await pool.end();
  }
})();
