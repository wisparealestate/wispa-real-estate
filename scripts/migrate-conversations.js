import fs from 'fs/promises';
import path from 'path';
import pkg from 'pg';

const { Pool } = pkg;
async function main(){
  const sqlPath = path.join(process.cwd(), 'migrations', '2026-02-21-add-conversations-and-messages.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  try {
    console.log('Running migration:', sqlPath);
    const parts = sql.split(/;\s*\n/).map(s=>s.trim()).filter(Boolean);
    for (const stmt of parts) {
      try {
        await pool.query(stmt);
      } catch (e) {
        console.warn('Statement failed (continuing):', stmt.slice(0,120), e.message);
      }
    }
    console.log('Migration complete');
  } catch (e) {
    console.error('Migration failed', e && e.stack ? e.stack : e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run immediately when executed as a script
main().catch(e=>{ console.error(e); process.exit(1); });
