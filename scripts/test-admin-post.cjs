#!/usr/bin/env node
const fetch = globalThis.fetch || require('node-fetch');
(async()=>{
  const base = process.env.API_HOST || 'http://localhost:3001';
  try{
    const res = await fetch(base + '/api/admin/sent-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test admin post', body: 'hello from test script' })
    });
    console.log('status', res.status);
    const txt = await res.text();
    console.log('body', txt);
  }catch(e){ console.error('request failed', e); }
})();