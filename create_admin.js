const bcrypt = require('bcrypt');
const { Client } = require('pg');

const password = 'Admin@Wispa2026'; // Admin password
const username = 'admin'; // Admin username
const email = 'admin@wispa.com'; // Admin email

bcrypt.hash(password, 10, async (err, hash) => {
  if (err) throw err;
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  await client.query(
    'INSERT INTO admin_logins (username, password_hash, email) VALUES ($1, $2, $3)',
    [username, hash, email]
  );
  await client.end();
  console.log('Admin user created!');
});
