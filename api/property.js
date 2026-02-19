
// The pool will be imported from index.js
import { pool } from "./index.js";

// Add property with photos
export async function addPropertyWithPhotos(property, photoUrls) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const propRes = await client.query(
      "INSERT INTO properties (user_id, title, description, price, address, city, state, zip_code, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
      [property.user_id, property.title, property.description, property.price, property.address, property.city, property.state, property.zip_code, property.image_url || null]
    );
    const propertyId = propRes.rows[0].id;
    for (const url of photoUrls) {
      await client.query(
        "INSERT INTO property_photos (property_id, photo_url) VALUES ($1, $2)",
        [propertyId, url]
      );
    }
    await client.query('COMMIT');
    return propertyId;
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
