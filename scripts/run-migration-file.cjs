const fs = require('fs');
const { Client } = require('pg');
const path = require('path');

const dbUrl = process.env.DATABASE_URL || process.argv[2];
const filePath = process.argv[3] || process.env.MIGRATION_FILE;
if (!dbUrl) { console.error('Missing DATABASE_URL'); process.exit(2); }
if (!filePath) { console.error('Missing migration file path'); process.exit(2); }

(async function(){
  const sql = fs.readFileSync(path.resolve(filePath),'utf8');
  const shouldUseSsl = String(dbUrl).includes('render.com') || process.env.DB_FORCE_SSL === 'true' || process.env.NODE_ENV === 'production';
  const client = new Client({ connectionString: dbUrl, ssl: shouldUseSsl ? { rejectUnauthorized: false } : false });
  try{
    await client.connect();
    console.log('Connected, running migration file:', filePath);
    await client.query(sql);
    console.log('Migration applied successfully');
    process.exit(0);
  }catch(e){ console.error('Migration failed:', e && e.message ? e.message : e); process.exit(1);}finally{ try{ await client.end(); }catch(_){ } }
})();
