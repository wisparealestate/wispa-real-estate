#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
(async function(){
  const dotenvPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(dotenvPath)){
    const env = fs.readFileSync(dotenvPath,'utf8').split(/\r?\n/).filter(Boolean).map(l=>l.trim()).filter(l=>!l.startsWith('#'));
    env.forEach(line=>{ const idx=line.indexOf('='); if(idx>0){ const k=line.slice(0,idx); const v=line.slice(idx+1); if(!process.env[k]) process.env[k]=v; } });
  }
  const API_HOST = process.env.API_HOST || 'http://localhost:3000';
  const url = API_HOST.replace(/\/$/,'') + '/api/properties';
  const payload = { property: { title: 'TEST POST '+Date.now(), address: '123 Test St', price: 12345, description: 'Automated test' }, photoUrls: [] };
  try{
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    console.log('status', res.status);
    const txt = await res.text();
    console.log('body:', txt);
  }catch(e){ console.error('post failed', e); process.exit(2); }
})();
