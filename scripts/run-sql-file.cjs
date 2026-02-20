const fs = require('fs');
const { Client } = require('pg');

const [,, dbUrl, filePath] = process.argv;
if (!dbUrl || !filePath) {
  console.error('Usage: node scripts/run-sql-file.cjs <DATABASE_URL> <sql-file>');
  process.exit(2);
}

let sql;
try {
  sql = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  console.error('Unable to read file:', filePath, err.message);
  process.exit(2);
}

function splitSqlStatements(input) {
  const stmts = [];
  let cur = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inDollar = null;

  while (i < input.length) {
    const ch = input[i];
    const nextTwo = input.substr(i, 2);

    if (inLineComment) {
      cur += ch;
      if (ch === '\n') inLineComment = false;
      i++; continue;
    }
    if (inBlockComment) {
      cur += ch;
      if (ch === '*' && input[i+1] === '/') { cur += '/'; i += 2; inBlockComment = false; continue; }
      i++; continue;
    }
    if (inSingle) {
      cur += ch;
      if (ch === "'" ) {
        if (input[i+1] === "'") { cur += "'"; i += 2; continue; }
        inSingle = false;
      }
      i++; continue;
    }
    if (inDouble) {
      cur += ch;
      if (ch === '"') inDouble = false;
      i++; continue;
    }
    if (inDollar) {
      cur += ch;
      if (input.substr(i, inDollar.length) === inDollar) {
        cur += input.substr(i+1, inDollar.length-1);
        i += inDollar.length;
        inDollar = null;
        continue;
      }
      i++; continue;
    }

    if (nextTwo === '--') { inLineComment = true; cur += nextTwo; i += 2; continue; }
    if (nextTwo === '/*') { inBlockComment = true; cur += nextTwo; i += 2; continue; }
    if (ch === "'") { inSingle = true; cur += ch; i++; continue; }
    if (ch === '"') { inDouble = true; cur += ch; i++; continue; }
    if (ch === '$') {
      const m = input.substr(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        inDollar = m[0];
        cur += inDollar;
        i += inDollar.length;
        continue;
      }
    }

    if (ch === ';') {
      const trimmed = cur.trim();
      if (trimmed) stmts.push(trimmed);
      cur = '';
      i++; continue;
    }

    cur += ch;
    i++;
  }
  const last = cur.trim();
  if (last) stmts.push(last);
  return stmts;
}

const statements = splitSqlStatements(sql).filter(s => {
  const low = s.trim().toUpperCase();
  return low !== 'BEGIN' && low !== 'COMMIT' && !low.startsWith('ROLLBACK');
});

(async () => {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log('\n-- Statement', i + 1, 'preview:');
      console.log(stmt.slice(0, 400).replace(/\n/g, ' '));
      try {
        await client.query(stmt);
      } catch (err) {
        console.error('\nERROR executing statement', i + 1);
        console.error('Statement:');
        console.error(stmt);
        console.error('\nPG ERROR:');
        console.error(err && err.message ? err.message : err);
        process.exit(1);
      }
    }
    console.log('\nAll statements executed successfully.');
  } finally {
    await client.end();
  }
})().catch(err => {
  console.error('Fatal error:', err && err.message ? err.message : err);
  process.exit(1);
});
