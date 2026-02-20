
// The pool will be imported from index.js
import { pool } from "./index.js";

// Add property with photos
export async function addPropertyWithPhotos(property, photoUrls) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Use full address in `address` column; leave city/state/zip_code null (frontend provides full address)
    const propRes = await client.query(
      "INSERT INTO properties (user_id, title, description, price, address, image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [property.user_id, property.title, property.description, property.price, property.address || property.location || null, property.image_url || null]
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
    return { property: Object.assign({}, propertyRow, { images: photos }), propertyId };
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
