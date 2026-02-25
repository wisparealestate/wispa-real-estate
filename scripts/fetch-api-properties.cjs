#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
(async function(){
  const dotenvPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(dotenvPath)){
    const env = fs.readFileSync(dotenvPath,'utf8').split(/\r?\n/).filter(Boolean).map(l=>l.trim()).filter(l=>!l.startsWith('#'));
    env.forEach(line=>{ const idx=line.indexOf('='); if(idx>0){ const k=line.slice(0,idx); const v=line.slice(idx+1); if(!process.env[k]) process.env[k]=v; } });
  }
  const host = process.env.API_HOST || 'http://localhost:3000';
  const url = host.replace(/\/$/,'') + '/api/properties';
  try{
    const res = await fetch(url, { method: 'GET' });
    console.log('status', res.status);
    const txt = await res.text();
    console.log('body (truncated 2000 chars):\n', txt.slice(0,2000));
  }catch(e){ console.error('Fetch failed', e); process.exit(2); }
})();
