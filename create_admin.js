const bcrypt = require('bcrypt');
const { Client } = require('pg');

const password = 'WispaAdmin2026!'; // Choose a strong password
const username = 'admin'; // Preferred admin username
const email = 'admin@wispa.com';

bcrypt.hash(password, 10, async (err, hash) => {
  if (err) throw err;
  const client = new Client({
    connectionString: 'postgresql://wispa:vfeaLtDzgjPtIdBzfIYiZe1wM5brKzHr@dpg-d6acunfgi27c73d1sgsg-a.oregon-postgres.render.com/wispa', // Your DATABASE_URL
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
