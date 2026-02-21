#!/usr/bin/env node
// Usage: node scripts/create-admin-user.js --username=admin --email=admin@example.com --password=Secret123
import pkg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pkg;
function parseArgs(){
  const out = {};
  for(const a of process.argv.slice(2)){
    const m = a.match(/^--([^=]+)=(.*)$/);
    if(m) out[m[1]] = m[2];
  }
  return out;
}

async function main(){
  const args = parseArgs();
  const username = args.username || args.user || process.env.ADMIN_USER || 'admin';
  const email = args.email || process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = args.password || process.env.ADMIN_PASS;
  if(!password){
    console.error('Missing password. Provide --password or set ADMIN_PASS env var.');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try{
    const hash = await bcrypt.hash(password, 10);
    // Upsert into users table with role = 'admin'
    const q = `
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
      RETURNING id, username, email, role;
    `;
    const res = await pool.query(q, [username, email, hash, 'Administrator', 'admin']);
    console.log('Admin user created/updated:', res.rows[0]);
    await pool.end();
    process.exit(0);
  }catch(e){ console.error('Error creating admin user:', e && e.message); try{ await pool.end(); }catch(_){} process.exit(1); }
}

main();
