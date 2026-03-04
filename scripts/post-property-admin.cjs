#!/usr/bin/env node
require('dotenv').config();
const fetch = globalThis.fetch || require('node-fetch');
const crypto = require('crypto');
const base = process.env.API_HOST || 'http://localhost:3001';
const adminId = parseInt(process.argv[2] || process.env.ADMIN_ID || '11', 10);
const secret = process.env.SESSION_SECRET || 'wispa_default_secret_change_me';
function base64url(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
function signPayload(b){ const h = crypto.createHmac('sha256', secret).update(b).digest('base64'); return h.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
(async()=>{
  try{
    const payload = JSON.stringify({ uid: adminId, exp: Math.floor(Date.now()/1000) + 7*24*3600 });
    const b = base64url(payload);
    const sig = signPayload(b);
    const token = b + '.' + sig;
    const cookie = `wispa_admin_session=${token}`;
    const property = {
      title: 'Scripted test property ' + Date.now(),
      address: '123 Script Rd',
      price: 1000,
      bedrooms: 1,
      bathrooms: 1,
      area: 50,
      description: 'Created by post-property-admin.cjs'
    };
    console.log('Posting property as admin', adminId);
    const res = await fetch(base + '/api/properties', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({ property: property, photoUrls: [] })
    });
    console.log('status', res.status);
    try{ const j = await res.json(); console.log('body', j); }catch(e){ const t = await res.text(); console.log('body-text', t); }
  }catch(e){ console.error('error', e && e.message ? e.message : e); process.exit(2); }
})();
