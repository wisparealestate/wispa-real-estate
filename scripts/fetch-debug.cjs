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
  const base = API_HOST.replace(/\/$/,'');
  try{
    console.log('GET', base + '/api/debug/db-info');
    const infoRes = await fetch(base + '/api/debug/db-info');
    console.log('status', infoRes.status);
    console.log(await infoRes.text());
  }catch(e){ console.error('db-info failed', e); }
  try{
    console.log('\nGET', base + '/api/debug/properties-recent');
    const recentRes = await fetch(base + '/api/debug/properties-recent');
    console.log('status', recentRes.status);
    const txt = await recentRes.text();
    console.log('body (truncated 4000 chars):\n', txt.slice(0,4000));
  }catch(e){ console.error('properties-recent failed', e); }
  // Try to fetch the last created id used in earlier tests (if provided)
  const testId = process.argv[2] || process.env.TEST_PROPERTY_ID || '625';
  try{
    console.log('\nGET', base + '/api/properties/' + testId);
    const r = await fetch(base + '/api/properties/' + encodeURIComponent(testId));
    console.log('status', r.status);
    console.log(await r.text());
  }catch(e){ console.error('fetch property id failed', e); }
})();
