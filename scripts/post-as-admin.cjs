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
    console.log('Posting as admin id', adminId, 'to', base + '/api/admin/sent-notifications');
    const res = await fetch(base + '/api/admin/sent-notifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({ title: 'Automated admin post (script)', body: 'test body from post-as-admin.cjs', data: { test: true } })
    });
    console.log('status', res.status);
    const txt = await res.text();
    try{ console.log('body', JSON.parse(txt)); }catch(e){ console.log('body', txt); }
  }catch(e){ console.error('error', e && e.message ? e.message : e); process.exit(2); }
})();
