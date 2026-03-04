#!/usr/bin/env node
const fetch = globalThis.fetch || require('node-fetch');
const base = process.env.API_HOST || 'http://localhost:3001';
const username = process.argv[2] || process.env.ADMIN_USER || 'admin';
const password = process.argv[3] || process.env.ADMIN_PASS || 'Secret123';
(async()=>{
  try{
    // login
    const loginRes = await fetch(base + '/api/admin-login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username, password })
    });
    console.log('login status', loginRes.status);
    const setCookieHeader = loginRes.headers.get && loginRes.headers.get('set-cookie');
    const cookies = [];
    if(setCookieHeader){
      // may be a single string or multiple; split conservatively
      setCookieHeader.split(/,(?=\s*[^;]+=)/).forEach(c => { if(c && c.trim()) cookies.push(c.trim()); });
    }
    console.log('set-cookie headers', cookies.length);
    if (loginRes.status !== 200) { console.log('login failed body:', await loginRes.text()); return; }
    const cookie = cookies.find(c=>c.startsWith('wispa_admin_session')) || cookies[0];
    console.log('using cookie:', !!cookie);
    // Post sent notification
    const postRes = await fetch(base + '/api/admin/sent-notifications', {
      method: 'POST', headers: { 'Content-Type':'application/json', 'Cookie': cookie || '' },
      body: JSON.stringify({ title: 'Automated admin post', body: 'test body', data: { test: true } })
    });
    console.log('post status', postRes.status);
    try{ console.log(await postRes.json()); }catch(e){ console.log(await postRes.text()); }
  }catch(e){ console.error('error', e && e.message ? e.message : e); }
})();