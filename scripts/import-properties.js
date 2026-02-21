import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT = path.join(__dirname, '..', 'data', 'properties.to_import.json');
const REPORT = path.join(__dirname, '..', 'data', 'import-report.json');

function normalize(p){
  return {
    source_id: p.id ?? null,
    title: (p.title||'').trim(),
    description: p.description || '',
    price: p.price ? Number(p.price) : null,
    address: p.address || p.location || null,
    image_url: p.image_url || (p.images && p.images[0]) || null,
    created_at: p.created_at ? new Date(p.created_at) : null,
    bedrooms: p.bedrooms != null ? Number(p.bedrooms) : null,
    bathrooms: p.bathrooms != null ? Number(p.bathrooms) : null,
    type: p.type || null,
    area: p.area != null ? Number(p.area) : null,
    sale_rent: p.sale_rent || null,
    post_to: p.post_to || null,
    images: Array.isArray(p.images) ? p.images : (p.image_url? [p.image_url] : [])
  };
}

function shortKey(p){
  return `${p.title}::${p.address}::${p.price}`;
}

async function main(){
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const DRY = !APPLY;

  if(!fs.existsSync(INPUT)){
    console.error('Input file not found:', INPUT);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT,'utf8'));
  const properties = (raw.properties || []).map(normalize);

  // In-input dedupe
  const map = new Map();
  const duplicates = [];
  for(const p of properties){
    const k = shortKey(p);
    if(map.has(k)){
      duplicates.push({existing: map.get(k), dup: p});
    } else {
      map.set(k,p);
    }
  }

  const unique = Array.from(map.values());

  const report = {
    inputCount: properties.length,
    uniqueCount: unique.length,
    duplicatesInInput: duplicates.length,
    duplicatesSample: duplicates.slice(0,20),
    actions: []
  };

  console.log(`Input records: ${properties.length}`);
  console.log(`Unique by key (title::address::price): ${unique.length}`);
  console.log(`Duplicates found within input: ${duplicates.length}`);

  if(DRY){
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log('Dry-run complete. Report written to', REPORT);
    console.log('To perform DB upsert, rerun with --apply and ensure DATABASE_URL is set.');
    process.exit(0);
  }

  // APPLY path: connect to DB and upsert
  const DATABASE_URL = process.env.DATABASE_URL;
  if(!DATABASE_URL){
    console.error('DATABASE_URL not set. Aborting.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  // connect with a few retries for transient network errors
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.connect();
      break;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = 500 * attempt;
      console.warn(`DB connect attempt ${attempt} failed, retrying in ${delay}ms...`, err.message);
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  for(const p of unique){
    try{
      // find possible duplicate within 10 minutes window
      let found = null;
      if(p.created_at){
        const ts = p.created_at.toISOString();
        const q = `SELECT id, created_at FROM properties WHERE title=$1 AND address=$2 AND price=$3 ORDER BY created_at DESC LIMIT 1`;
        const res = await client.query(q, [p.title, p.address, p.price]);
        if(res.rows.length){
          const row = res.rows[0];
          const existingTs = new Date(row.created_at);
          const diff = Math.abs(existingTs - p.created_at);
          if(diff <= 10 * 60 * 1000){
            found = row;
          }
        }
      }

      if(found){
        // update
        const upd = `UPDATE properties SET title=$1, description=$2, price=$3, address=$4, image_url=$5, created_at=$6, bedrooms=$7, bathrooms=$8, type=$9, area=$10, sale_rent=$11, post_to=$12 WHERE id=$13 RETURNING id`;
        const vals = [p.title, p.description, p.price, p.address, p.image_url, p.created_at || new Date(), p.bedrooms, p.bathrooms, p.type, p.area, p.sale_rent, p.post_to, found.id];
        const ur = await client.query(upd, vals);
        const pid = ur.rows[0].id;
        // replace photos
        await client.query('DELETE FROM property_photos WHERE property_id=$1', [pid]);
        for(const url of p.images){
          await client.query('INSERT INTO property_photos(property_id, photo_url) VALUES($1,$2)', [pid, url]);
        }
        report.actions.push({action:'update', property: p.title, property_id: pid});
      } else {
        // insert
        const ins = `INSERT INTO properties(title, description, price, address, image_url, created_at, bedrooms, bathrooms, type, area, sale_rent, post_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`;
        const vals = [p.title, p.description, p.price, p.address, p.image_url, p.created_at || new Date(), p.bedrooms, p.bathrooms, p.type, p.area, p.sale_rent, p.post_to];
        const ir = await client.query(ins, vals);
        const pid = ir.rows[0].id;
        for(const url of p.images){
          await client.query('INSERT INTO property_photos(property_id, photo_url) VALUES($1,$2)', [pid, url]);
        }
        report.actions.push({action:'insert', property: p.title, property_id: pid});
      }
    }catch(err){
      console.error('Error processing', p.title, err.message);
      report.actions.push({action:'error', property: p.title, error: err.message});
    }
  }

  await client.end();
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('Apply complete. Report written to', REPORT);
}

main().catch(e=>{console.error(e); process.exit(1);});
