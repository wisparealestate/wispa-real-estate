const fs = require('fs');
const path = require('path');

const SERVER = process.env.SERVER_BASE || 'https://wispa-real-estate-2ew3.onrender.com';
const uploadEndpoint = SERVER.replace(/\/$/, '') + '/api/upload-photos';
const propertiesEndpoint = SERVER.replace(/\/$/, '') + '/api/properties';

async function main() {
  const args = process.argv.slice(2);
  // args: [image1.jpg image2.jpg ...]
  const images = args.length ? args : [];

  if (!images.length) {
    console.log('No image paths provided. Running without images.');
  }

  let photoUrls = [];

  if (images.length) {
    const fd = new FormData();
    images.forEach((img, i) => {
      const p = path.resolve(img);
      if (!fs.existsSync(p)) {
        console.error('File not found:', p);
        process.exit(2);
      }
      fd.append('photos', fs.createReadStream(p));
    });

    console.log('Uploading', images.length, 'files to', uploadEndpoint);
    const res = await fetch(uploadEndpoint, { method: 'POST', body: fd });
    if (!res.ok) {
      console.error('Upload failed:', res.status, await res.text());
      process.exit(1);
    }
    const j = await res.json();
    photoUrls = j.urls || j.urls || [];
    console.log('Upload returned URLs:', photoUrls);
  }

  // Build property payload with all fields
  const payload = {
    title: 'Automated Test Property ' + Date.now(),
    description: 'Created by test-upload-post.cjs',
    price: 123456,
    address: '100 Test St, Testville',
    bedrooms: 3,
    bathrooms: 2,
    area: 120.5,
    type: 'apartment',
    sale_rent: 'sale',
    post_to: 'available',
    photoUrls: photoUrls
  };

  console.log('Posting property to', propertiesEndpoint);
  const postRes = await fetch(propertiesEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ property: payload, photoUrls: photoUrls })
  });

  const postText = await postRes.text();
  let postJson;
  try { postJson = JSON.parse(postText); } catch(e) { postJson = postText; }

  console.log('POST status', postRes.status);
  console.log('POST response:', JSON.stringify(postJson, null, 2));

  if (!postRes.ok) process.exit(1);

  // If server returned the created property id, fetch it
  const created = (postJson && postJson.property) ? postJson.property : (postJson && postJson.id ? { id: postJson.id } : null);
  if (created && created.id) {
    console.log('Verifying created property via GET /api/properties');
    const getRes = await fetch(propertiesEndpoint);
    const getJson = await getRes.json();
    const found = (getJson.properties || []).find(p => p.id === created.id) || (getJson[0] && getJson.find && getJson.find(p => p.id === created.id));
    console.log('Found property:', JSON.stringify(found || 'NOT FOUND', null, 2));
  }
  console.log('Done');
}

main().catch(err => { console.error('Fatal:', err && err.stack || err); process.exit(1); });
