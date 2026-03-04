const { Client } = require('pg');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Missing DATABASE_URL env var');
  process.exit(2);
}

(async () => {
  const shouldUseSsl = String(dbUrl).includes('render.com') || process.env.DB_FORCE_SSL === 'true' || process.env.NODE_ENV === 'production';
  const client = new Client({ connectionString: dbUrl, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
  try {
    await client.connect();
    console.log('Connected to DB');

    const queries = [
      {
        name: 'missing_titles',
        sql: "SELECT id, title, created_at FROM properties WHERE title IS NULL OR trim(title) = '' ORDER BY created_at DESC LIMIT 50;"
      },
      {
        name: 'images_not_array_or_null',
        sql: "SELECT id, images, jsonb_typeof(images) AS images_type FROM properties WHERE images IS NULL OR (jsonb_typeof(images) IS DISTINCT FROM 'array') LIMIT 50;"
      },
      {
        name: 'duplicate_ids',
        sql: "SELECT id, count(*) AS cnt FROM properties GROUP BY id HAVING count(*) > 1;"
      },
      {
        name: 'recent_properties_1h',
        sql: "SELECT id, title, images, image_url, created_at FROM properties WHERE created_at > now() - interval '1 hour' ORDER BY created_at DESC LIMIT 50;"
      }
    ];

    for (const q of queries) {
      try {
        console.log('\n----', q.name, '----');
        const res = await client.query(q.sql);
        console.log('rows:', JSON.stringify(res.rows, null, 2));
      } catch (err) {
        console.error('Query failed for', q.name, err && err.message ? err.message : err);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error running checks:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    try { await client.end(); } catch (e) {}
  }
})();
