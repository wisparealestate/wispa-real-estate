const { Client } = require('pg');

const dbUrl = process.argv[2] || process.env.DATABASE_URL;
const sql = process.argv[3] || "ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255);";
if (!dbUrl) {
  console.error('Missing DATABASE_URL (pass as arg or set env var)');
  process.exit(2);
}

(async () => {
  // Enable SSL for cloud-hosted DBs (Render/Postgres require TLS).
  const shouldUseSsl = String(dbUrl).includes('render.com') || process.env.DB_FORCE_SSL === 'true' || process.env.NODE_ENV === 'production';
  const client = new Client({ connectionString: dbUrl, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
  try {
    await client.connect();
    console.log('Connected, executing SQL...');
    const res = await client.query(sql);
    console.log('SQL executed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Execution failed:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    try { await client.end(); } catch (e) {}
  }
})();
