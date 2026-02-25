import pkg from 'pg';
const { Pool } = pkg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL');
  process.exit(2);
}
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    const r = await pool.query('SELECT id, title, address, price, created_at FROM properties ORDER BY created_at DESC LIMIT 10');
    console.log('[verify properties] rows:', JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error('[verify properties] query failed:', e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
