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

async function generateUnique8DigitId() {
  // Try multiple times to avoid rare collisions
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = Math.floor(10000000 + Math.random() * 90000000); // 8-digit
    try {
      const res = await pool.query('SELECT 1 FROM public.properties WHERE id = $1 LIMIT 1', [id]);
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
  try {
    // Diagnostic: log current DB info
    try{
      const info = await pool.query("SELECT current_database() AS db, current_schema() AS schema");
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

    // Server-side sanitization to prevent numeric overflow errors when writing to DB.
    // NUMERIC(12,2) for price -> max 9,999,999,999.99 (10 digits before decimal)
    // NUMERIC(10,2) for area  -> max 99,999,999.99 (8 digits before decimal)
    const sanitizeFloat = (val, scale) => {
      if (val === null || val === undefined) return null;
      const n = Number(val);
      if (!Number.isFinite(n)) return null;
      const factor = Math.pow(10, scale || 2);
      return Math.round(n * factor) / factor;
    };
    // Coerce and round
    p.price = sanitizeFloat(p.price, 2);
    p.area = sanitizeFloat(p.area, 2);
    // Bedrooms/bathrooms should be integers
    p.bedrooms = p.bedrooms != null ? (Number.isFinite(Number(p.bedrooms)) ? parseInt(Number(p.bedrooms), 10) : null) : null;
    p.bathrooms = p.bathrooms != null ? (Number.isFinite(Number(p.bathrooms)) ? parseInt(Number(p.bathrooms), 10) : null) : null;

    // Validate ranges to match DB precision/scale and provide a clear client error
    const MAX_PRICE = 9999999999.99; // NUMERIC(12,2)
    const MAX_AREA = 99999999.99; // NUMERIC(10,2)
    if (p.price != null && Math.abs(p.price) > MAX_PRICE) {
      const e = new Error('price exceeds maximum allowed value'); e.statusCode = 400; throw e;
    }
    if (p.area != null && Math.abs(p.area) > MAX_AREA) {
      const e = new Error('area exceeds maximum allowed value'); e.statusCode = 400; throw e;
    }
    // Normalize type / sale_rent / post_to
    p.type = p.type || p.property_type || null;
    p.sale_rent = p.sale_rent || p.saleRent || p.for || null;
    p.post_to = p.post_to || p.postTo || p.post || null;

    // We'll perform all DB writes in a single transaction to ensure atomic visibility
    const client = await pool.connect();
    let propertyRow = null;
    let propertyId = null;
    let didInsertNew = false;
    try {
      await client.query('BEGIN');

      // session info (use client)
      try{
        const info = await client.query("SELECT current_database() AS db, current_schema() AS schema");
        if(info && info.rows && info.rows[0]){
          await writeDiag({ where: 'before', info: info.rows[0] });
        }
      }catch(e){ /* ignore */ }

      if (incomingId) {
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
        }
      }

      if (!propertyRow) {
        // generate an 8-digit unique id using the transaction client
        let generatedId = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          const id = Math.floor(10000000 + Math.random() * 90000000);
          const exists = await client.query('SELECT 1 FROM public.properties WHERE id = $1 LIMIT 1', [id]);
          if (!exists.rows || exists.rows.length === 0) { generatedId = id; break; }
        }
        if (!generatedId) throw new Error('Failed to generate unique 8-digit property id');

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
        didInsertNew = true;
        try{ await writeDiag({ event: 'inserted', propertyId, title: propertyRow.title }); }catch(e){}
      }

      // Persist photos on the properties table in the `images` jsonb column.
      let photos = [];
      if (Array.isArray(photoUrls)) {
        // Store images as jsonb explicitly: pass JSON string and cast to jsonb in SQL
        await client.query('UPDATE public.properties SET images = $1::jsonb WHERE id = $2', [JSON.stringify(photoUrls || []), propertyId]);
        photos = photoUrls.filter(Boolean);
      } else {
        const pImgs = await client.query('SELECT images FROM public.properties WHERE id = $1', [propertyId]);
        if (pImgs && pImgs.rows && pImgs.rows[0] && Array.isArray(pImgs.rows[0].images)) photos = pImgs.rows[0].images;
      }

      // If property has no canonical image_url, set it to the first photo we just inserted
      try {
        if (photos && photos.length) {
          const current = propertyRow && (propertyRow.image_url || propertyRow.image) ? (propertyRow.image_url || propertyRow.image) : null;
          if (!current) {
            await client.query('UPDATE public.properties SET image_url = $1 WHERE id = $2', [photos[0], propertyId]);
            if (propertyRow) propertyRow.image_url = photos[0];
            await writeDiag({ where: 'set-image_url-from-photos', propertyId, image: photos[0] });
          }
        }
      } catch (e) { await writeDiag({ where: 'set-image_url-error', propertyId, error: e && e.message ? e.message : String(e) }); }

      // Create a site-wide notification about the new property only when a new row was inserted
      let notifPayload = null;
      if (didInsertNew) {
        notifPayload = { propertyId: propertyId, title: p.title || propertyRow.title || null };
        try {
          await client.query(
            `INSERT INTO public.notifications (category, title, body, target, data, is_read, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
            ['properties', (p.title || propertyRow.title) ? `New property: ${p.title || propertyRow.title}` : 'New property posted', p.description || null, null, notifPayload, false]
          );
        } catch (errInsert) {
          try {
            await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'notification_category'::regtype AND enumlabel = 'properties') THEN ALTER TYPE notification_category ADD VALUE 'properties'; END IF; END$$;`);
            await client.query(
              `INSERT INTO public.notifications (category, title, body, target, data, is_read, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
              ['properties', (p.title || propertyRow.title) ? `New property: ${p.title || propertyRow.title}` : 'New property posted', p.description || null, null, notifPayload, false]
            );
          } catch (e2) {
            // ignore notification failures
          }
        }
      }

      // Ensure SERIAL sequence stays in sync after explicit id inserts
      try {
        await client.query(`SELECT setval(pg_get_serial_sequence('properties','id'), (SELECT COALESCE(MAX(id), 1) FROM properties))`);
      } catch (e) {
        try { await writeDiag({ where: 'setval-error', error: e && e.message ? e.message : String(e) }); } catch(_){ }
      }

      // Also record an activity and an owner alert where appropriate
      try{
        if (!notifPayload) notifPayload = { propertyId: propertyId, title: p.title || propertyRow.title || null };
        await client.query(
          'INSERT INTO activities (user_id, activity_type, target_type, target_id, payload, created_at) VALUES ($1,$2,$3,$4,$5,now())',
          [p.user_id || null, 'property_created', 'property', propertyId, notifPayload]
        );
      }catch(e){ /* non-fatal */ }
      try{
        if(p.user_id){
          await client.query(
            'INSERT INTO alerts (user_id, type, payload, read, created_at) VALUES ($1,$2,$3,$4,now())',
            [p.user_id, 'your_property_posted', { propertyId, title: p.title || propertyRow.title || null }, false]
          );
        }
      }catch(e){ /* non-fatal */ }

      // session info after
      try{
        const infoAfter = await client.query("SELECT current_database() AS db, current_schema() AS schema");
        if(infoAfter && infoAfter.rows && infoAfter.rows[0]){
          await writeDiag({ where: 'after', info: infoAfter.rows[0], propertyId, didInsertNew: !!didInsertNew });
        }
      }catch(e){ /* ignore */ }

      // Verify visibility of the inserted row
      try{
        if(propertyId){
          const verify = await client.query('SELECT id, title, created_at FROM public.properties WHERE id = $1', [propertyId]);
          await writeDiag({ where: 'verify-after-commit', propertyId, verifyRowCount: verify.rowCount, verifyRows: verify.rows });
        }
      }catch(e){ try{ await writeDiag({ where: 'verify-error', error: e && e.message ? e.message : String(e) }); }catch(_){} }

      await client.query('COMMIT');
      const merged = Object.assign({}, propertyRow, p || {}, { images: photos });
      return { property: merged, propertyId };
    } catch (txErr) {
      try { await client.query('ROLLBACK'); } catch(_){}
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    try{ await writeDiag({ event: 'error', error: err && err.stack ? err.stack : err }); }catch(e){}
    throw err;
  }
}

// Get property photos
export async function getPropertyPhotos(propertyId) {
  const res = await pool.query('SELECT images FROM public.properties WHERE id = $1', [propertyId]);
  if (res && res.rows && res.rows[0] && Array.isArray(res.rows[0].images)) return res.rows[0].images;
  return [];
}
