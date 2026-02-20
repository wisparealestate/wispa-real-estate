// The pool will be imported from index.js
import { pool } from "./index.js";

// Add property with photos
export async function addPropertyWithPhotos(property, photoUrls) {
  const client = await pool.connect();
  try {
    // Normalize incoming property to tolerate many client shapes
    const p = Object.assign({}, property || {});
    // Remove identity fields if present (we always INSERT)
    delete p.id;
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
    const propertyRow = propRes.rows[0];
    const propertyId = propertyRow.id;
    for (const url of photoUrls) {
      await client.query(
        "INSERT INTO property_photos (property_id, photo_url) VALUES ($1, $2)",
        [propertyId, url]
      );
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
