// The pool will be imported from index.js
import { pool } from "./index.js";

// Add property with photos
export async function addPropertyWithPhotos(property, photoUrls) {
  const client = await pool.connect();
  try {
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
    // Normalize type / sale_rent / post_to
    p.type = p.type || p.property_type || null;
    p.sale_rent = p.sale_rent || p.saleRent || p.for || null;
    p.post_to = p.post_to || p.postTo || p.post || null;
    await client.query('BEGIN');
    // Use full address in `address` column; leave city/state/zip_code null (frontend provides full address)
    let propertyRow = null;
    let propertyId = null;
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
      // Basic duplicate detection: if a property with same title+address+price
      // was created recently, treat this as an update to avoid rapid duplicate inserts.
      try {
        const titleNorm = (p.title || '').trim().toLowerCase();
        const addrNorm = (p.address || p.location || '').trim().toLowerCase();
        const priceNorm = p.price != null ? Number(p.price) : 0;
        if (titleNorm && addrNorm) {
          const dupRes = await client.query(
            `SELECT id FROM properties WHERE lower(trim(coalesce(title,''))) = $1 AND lower(trim(coalesce(address,''))) = $2 AND coalesce(price,0) = $3 AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 1`,
            [titleNorm, addrNorm, priceNorm]
          );
          if (dupRes.rows && dupRes.rows.length) {
            // Found a recent duplicate — update it instead of inserting a new row
            const existingId = dupRes.rows[0].id;
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
        // ignore duplicate detection errors and proceed to insert
      }
      const propRes = await client.query(
        `INSERT INTO properties
        (user_id, title, description, price, address, image_url, bedrooms, bathrooms, type, area, sale_rent, post_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
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
          p.post_to || null
        ]
      );
      propertyRow = propRes.rows[0];
      propertyId = propertyRow.id;
    }

    // Replace photos for this property: delete existing then insert provided list (avoids duplicates)
    if (Array.isArray(photoUrls) && photoUrls.length) {
      await client.query('DELETE FROM property_photos WHERE property_id = $1', [propertyId]);
      for (const url of photoUrls) {
        if (!url) continue;
        await client.query(
          "INSERT INTO property_photos (property_id, photo_url) VALUES ($1, $2)",
          [propertyId, url]
        );
      }
    }
    // Fetch photos and return assembled property
    const photosRes = await client.query('SELECT photo_url FROM property_photos WHERE property_id = $1', [propertyId]);
    const photos = photosRes.rows.map(r => r.photo_url);
    await client.query('COMMIT');
    // Merge provided property fields (e.g. type, bedrooms, bathrooms, location) into returned row
    const merged = Object.assign({}, propertyRow, p || {}, { images: photos });
    return { property: merged, propertyId };
  } catch (err) {
    await client.query('ROLLBACK');
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
