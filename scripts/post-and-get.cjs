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
  const postUrl = API_HOST.replace(/\/$/,'') + '/api/properties';
  const getUrl = API_HOST.replace(/\/$/,'') + '/api/properties';
  const payload = { property: { title: 'TEST POST '+Date.now(), address: '123 Test St', price: 12345, description: 'Automated test' }, photoUrls: [] };
  try{
    const pRes = await fetch(postUrl, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    console.log('POST status', pRes.status);
    const ptext = await pRes.text();
    console.log('POST body:', ptext);
  }catch(e){ console.error('post failed', e); }
  try{
    const gRes = await fetch(getUrl, { method: 'GET' });
    console.log('GET status', gRes.status);
    const gtxt = await gRes.text();
    console.log('GET body:', gtxt);
  }catch(e){ console.error('get failed', e); }
})();
