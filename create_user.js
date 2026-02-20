#!/usr/bin/env node
const bcrypt = require('bcrypt');
const { Client } = require('pg');

// Usage: node create_user.js username email password "Full Name" role
(async () => {
  try {
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.error('Usage: node create_user.js <username> <email> <password> [full_name] [role]');
      process.exit(1);
    }
    const [username, email, password, full_name = null, role = 'user'] = args;

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    await client.connect();

    const hash = await bcrypt.hash(password, 10);
    const q = `INSERT INTO users (username, email, password_hash, full_name, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, email, full_name, role, created_at`;
    const res = await client.query(q, [username, email, hash, full_name, role]);
    console.log('Created user:', res.rows[0]);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('Error creating user:', err.message || err);
    process.exit(2);
  }
})();
