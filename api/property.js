// The pool will be imported from index.js
import { pool } from "./index.js";
import fs from 'fs/promises';
import path from 'path';

const __diagDir = path.join(process.cwd(), 'logs');
async function writeDiag(msg){
  try{
    await fs.mkdir(__diagDir, { recursive: true });
    const file = path.join(__diagDir, 'property-debug.log');
    const line = new Date().toISOString() + ' ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)) + '\n';
    await fs.appendFile(file, line, 'utf8');
  }catch(e){
    try{ console.warn('[diag] write failed', e && e.message ? e.message : e); }catch(_){}
  }
}

async function generateUnique8DigitId(client) {
  // Try multiple times to avoid rare collisions
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = Math.floor(10000000 + Math.random() * 90000000); // 8-digit
    try {
      const res = await client.query('SELECT 1 FROM public.properties WHERE id = $1 LIMIT 1', [id]);
      if (!res.rows || res.rows.length === 0) return id;
    } catch (e) {
      // If table doesn't exist or query fails, rethrow so caller can handle
      throw e;
    }
  }
  throw new Error('Failed to generate unique 8-digit property id after multiple attempts');
}

// Add property with photos
export async function addPropertyWithPhotos(property, photoUrls) {
  const client = await pool.connect();
  try {
    // Diagnostic: log this session's current database and schema
    try{
      const info = await client.query("SELECT current_database() AS db, current_schema() AS schema");
      if(info && info.rows && info.rows[0]){
        console.log('[addPropertyWithPhotos] session DB info:', info.rows[0]);
        await writeDiag({ where: 'before', info: info.rows[0] });
      }
    }catch(e){ console.warn('[addPropertyWithPhotos] failed to read session DB info', e && e.message ? e.message : e); }
    // Normalize incoming property to tolerate many client shapes
    const p = Object.assign({}, property || {});
    // Accept explicit server id for updates when provided by client, but only if numeric
    const incomingIdRaw = p._serverId || p.propertyId || p.serverId || p.id || null;
    const incomingId = incomingIdRaw ? (Number.isFinite(Number(incomingIdRaw)) ? Number(incomingIdRaw) : null) : null;
    // Remove identity fields from payload copy to avoid accidental overwrite
    delete p.id;
    delete p.propertyId;
    delete p._serverId;
    delete p.serverId;
    delete p.created_at;
    // Normalize numeric fields
    p.bedrooms = p.bedrooms != null ? (Number(p.bedrooms) || 0) : (p.beds != null ? Number(p.beds) || 0 : null);
    p.bathrooms = p.bathrooms != null ? (Number(p.bathrooms) || 0) : (p.baths != null ? Number(p.baths) || 0 : null);
    p.area = p.area != null ? (Number(p.area) || 0) : (p.size != null ? Number(p.size) || 0 : null);
    // Ensure required DB columns are satisfied: `price` is NOT NULL in schema — default to 0 when missing
    if (p.price == null) p.price = 0;
    // Normalize type / sale_rent / post_to
    p.type = p.type || p.property_type || null;
    p.sale_rent = p.sale_rent || p.saleRent || p.for || null;
    p.post_to = p.post_to || p.postTo || p.post || null;
    await client.query('BEGIN');
    // Use full address in `address` column; leave city/state/zip_code null (frontend provides full address)
    let propertyRow = null;
    let propertyId = null;
    let didInsertNew = false;
    if (incomingId) {
      // Update existing property
      const updateRes = await client.query(
        `UPDATE properties SET
           user_id = $1, title = $2, description = $3, price = $4, address = $5, image_url = $6,
           bedrooms = $7, bathrooms = $8, type = $9, area = $10, sale_rent = $11, post_to = $12
         WHERE id = $13 RETURNING *`,
        [
          p.user_id || null,
          p.title || null,
          p.description || null,
          p.price != null ? p.price : null,
          p.address || p.location || null,
          p.image_url || p.image || null,
          p.bedrooms != null ? p.bedrooms : null,
          p.bathrooms != null ? p.bathrooms : null,
          p.type || null,
          p.area != null ? p.area : null,
          p.sale_rent || null,
          p.post_to || null,
          incomingId
        ]
      );
      if (updateRes.rows && updateRes.rows.length) {
        propertyRow = updateRes.rows[0];
        propertyId = propertyRow.id;
      } else {
        // If update didn't find a row, fall back to insert
      }
    }
    if (!propertyRow) {
      // Strong duplicate protection:
      // - Acquire a transaction-scoped advisory lock on a hash of the dedupe key
      // - Look for any existing property with same normalized title+address+price
      // - If found, update it; otherwise insert a new row
      try {
        const titleNorm = (p.title || '').trim().toLowerCase();
        const addrNorm = (p.address || p.location || '').trim().toLowerCase();
        const priceNorm = p.price != null ? Number(p.price) : 0;
        if (titleNorm && addrNorm) {
          const key = `${titleNorm}::${addrNorm}::${priceNorm}`;
          // simple 32-bit hash for advisory lock
          let h = 0;
          for (let i = 0; i < key.length; i++) {
            h = ((h << 5) - h) + key.charCodeAt(i);
            h |= 0;
          }
          // Acquire an advisory lock for the duration of the transaction to prevent races
          try {
            await client.query('SELECT pg_advisory_xact_lock($1)', [h]);
          } catch (e) {
            // If advisory locks not allowed, ignore and continue (best-effort)
          }

          // Now look for any existing property (no time window)
          const dupRes = await client.query(
            `SELECT id FROM public.properties WHERE lower(trim(coalesce(title,''))) = $1 AND lower(trim(coalesce(address,''))) = $2 AND coalesce(price,0) = $3 LIMIT 1`,
            [titleNorm, addrNorm, priceNorm]
          );
          if (dupRes.rows && dupRes.rows.length) {
            const existingId = dupRes.rows[0].id;
            const updateRes = await client.query(
              `UPDATE public.properties SET
                 user_id = $1, title = $2, description = $3, price = $4, address = $5, image_url = $6,
                 bedrooms = $7, bathrooms = $8, type = $9, area = $10, sale_rent = $11, post_to = $12
               WHERE id = $13 RETURNING *`,
              [
                p.user_id || null,
                p.title || null,
                p.description || null,
                p.price != null ? p.price : null,
                p.address || p.location || null,
                p.image_url || p.image || null,
                p.bedrooms != null ? p.bedrooms : null,
                p.bathrooms != null ? p.bathrooms : null,
                p.type || null,
                p.area != null ? p.area : null,
                p.sale_rent || null,
                p.post_to || null,
                existingId
              ]
            );
            if (updateRes.rows && updateRes.rows.length) {
              propertyRow = updateRes.rows[0];
              propertyId = propertyRow.id;
            }
          }
        }
      } catch (e) {
        // ignore dup-protection errors and fall back to insert
      }

      if (!propertyRow) {
        // generate an 8-digit unique id to use as the property primary key
        const generatedId = await generateUnique8DigitId(client);
        const propRes = await client.query(
          `INSERT INTO public.properties
          (id, user_id, title, description, price, address, image_url, bedrooms, bathrooms, type, area, sale_rent, post_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
          [
            generatedId,
            p.user_id || null,
            p.title || null,
            p.description || null,
            p.price != null ? p.price : null,
            p.address || p.location || null,
            p.image_url || p.image || null,
            p.bedrooms != null ? p.bedrooms : null,
            p.bathrooms != null ? p.bathrooms : null,
            p.type || null,
            p.area != null ? p.area : null,
            p.sale_rent || null,
            p.post_to || null
          ]
        );
        propertyRow = propRes.rows[0];
        propertyId = propertyRow.id;
        console.log('[addPropertyWithPhotos] inserted property id:', propertyId, 'title:', propertyRow.title);
        try{ await writeDiag({ event: 'inserted', propertyId, title: propertyRow.title }); }catch(e){}
        didInsertNew = true;
      }
    }

    // Replace photos for this property: delete existing then insert provided list (avoids duplicates)
    if (Array.isArray(photoUrls) && photoUrls.length) {
      await client.query('DELETE FROM public.property_photos WHERE property_id = $1', [propertyId]);
      for (const url of photoUrls) {
        if (!url) continue;
        await client.query(
          "INSERT INTO public.property_photos (property_id, photo_url) VALUES ($1, $2)",
          [propertyId, url]
        );
      }
    }
    // Fetch photos and return assembled property
    const photosRes = await client.query('SELECT photo_url FROM public.property_photos WHERE property_id = $1', [propertyId]);
    const photos = photosRes.rows.map(r => r.photo_url);
    // If property has no canonical image_url, set it to the first photo we just inserted
    try {
      if (photos && photos.length) {
        // propertyRow may be from an earlier SELECT/INSERT; prefer its image_url field
        const currentImageUrl = propertyRow && (propertyRow.image_url || propertyRow.image) ? (propertyRow.image_url || propertyRow.image) : null;
        if (!currentImageUrl) {
          try {
            await client.query('UPDATE public.properties SET image_url = $1 WHERE id = $2', [photos[0], propertyId]);
            // Update the in-memory copy so returned object includes the new value
            if (propertyRow) propertyRow.image_url = photos[0];
            await writeDiag({ where: 'set-image_url-from-photos', propertyId, image: photos[0] });
          } catch (e) {
            await writeDiag({ where: 'set-image_url-error', propertyId, error: e && e.message ? e.message : String(e) });
          }
        }
      }
    } catch (e) { /* non-fatal */ }
    // Create a site-wide notification about the new property only when a new row was inserted
    if (didInsertNew) {
      try {
        const notifPayload = { propertyId: propertyId, title: p.title || propertyRow.title || null };
        try {
          await client.query(
            `INSERT INTO public.notifications (category, title, body, target, data, is_read, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
            ['properties', (p.title || propertyRow.title) ? `New property: ${p.title || propertyRow.title}` : 'New property posted', p.description || null, null, JSON.stringify(notifPayload), false]
          );
        } catch (errInsert) {
          // If the enum type doesn't include 'properties', try to add it then retry once
          try {
            await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'notification_category'::regtype AND enumlabel = 'properties') THEN ALTER TYPE notification_category ADD VALUE 'properties'; END IF; END$$;`);
            await client.query(
              `INSERT INTO public.notifications (category, title, body, target, data, is_read, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
              ['properties', (p.title || propertyRow.title) ? `New property: ${p.title || propertyRow.title}` : 'New property posted', p.description || null, null, JSON.stringify(notifPayload), false]
            );
          } catch (e2) {
            // ignore notification failures
          }
        }
      } catch(e){ /* ignore notification failures */ }
    }
    await client.query('COMMIT');
    // Ensure SERIAL sequence stays in sync after explicit id inserts
    try {
      await pool.query(`SELECT setval(pg_get_serial_sequence('properties','id'), (SELECT COALESCE(MAX(id), 1) FROM properties))`);
    } catch (e) {
      try { await writeDiag({ where: 'setval-error', error: e && e.message ? e.message : String(e) }); } catch(_){}
    }
    try{
      const infoAfter = await client.query("SELECT current_database() AS db, current_schema() AS schema");
      if(infoAfter && infoAfter.rows && infoAfter.rows[0]){
        console.log('[addPropertyWithPhotos] session DB info after commit:', infoAfter.rows[0]);
        await writeDiag({ where: 'after', info: infoAfter.rows[0], propertyId, didInsertNew: !!didInsertNew });
      }
    }catch(e){ console.warn('[addPropertyWithPhotos] failed to read session DB info after commit', e && e.message ? e.message : e); }
    // Verify visibility of the inserted row from the same session/client
    try{
      if(propertyId){
        const verify = await client.query('SELECT id, title, created_at FROM public.properties WHERE id = $1', [propertyId]);
        await writeDiag({ where: 'verify-after-commit', propertyId, verifyRowCount: verify.rowCount, verifyRows: verify.rows });
      }
    }catch(e){ try{ await writeDiag({ where: 'verify-error', error: e && e.message ? e.message : String(e) }); }catch(_){} }
    // As a fallback: if the global properties table appears empty to other connections, ensure at least one
    try{
      const globalCountRes = await pool.query('SELECT count(*) AS cnt FROM properties');
      const globalCount = (globalCountRes && globalCountRes.rows && Number(globalCountRes.rows[0].cnt)) || 0;
      await writeDiag({ where: 'global-count-after-commit', propertyId, globalCount });
      if (globalCount === 0 && propertyRow) {
        try{
          const rein = await pool.query(
            `INSERT INTO properties (id,user_id,title,description,price,address,image_url,bedrooms,bathrooms,type,area,sale_rent,post_to,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING id`,
            [propertyRow.id || null, propertyRow.user_id || null, propertyRow.title || p.title || null, propertyRow.description || p.description || null, propertyRow.price != null ? propertyRow.price : null, propertyRow.address || p.address || p.location || null, propertyRow.image_url || p.image || null, propertyRow.bedrooms != null ? propertyRow.bedrooms : null, propertyRow.bathrooms != null ? propertyRow.bathrooms : null, propertyRow.type || null, propertyRow.area != null ? propertyRow.area : null, propertyRow.sale_rent || null, propertyRow.post_to || null]
          );
          await writeDiag({ where: 'reinsertion', originalPropertyId: propertyId, newId: (rein && rein.rows && rein.rows[0] && rein.rows[0].id) || null });
        }catch(e){ await writeDiag({ where: 'reinsertion-error', error: e && e.message ? e.message : String(e) }); }
      }
    }catch(e){ try{ await writeDiag({ where: 'global-count-error', error: e && e.message ? e.message : String(e) }); }catch(_){} }
    // Merge provided property fields (e.g. type, bedrooms, bathrooms, location) into returned row
    const merged = Object.assign({}, propertyRow, p || {}, { images: photos });
    return { property: merged, propertyId };
  } catch (err) {
    try{ await client.query('ROLLBACK'); }catch(e){}
    try{ await writeDiag({ event: 'error', error: err && err.stack ? err.stack : err }); }catch(e){}
    throw err;
  } finally {
    client.release();
  }
}

// Get property photos
export async function getPropertyPhotos(propertyId) {
  const res = await pool.query(
    "SELECT photo_url FROM property_photos WHERE property_id = $1",
    [propertyId]
  );
  return res.rows.map(r => r.photo_url);
}
