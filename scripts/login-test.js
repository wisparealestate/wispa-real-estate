// Simple login flow tester: tries /db-test, /api/signup, /api/login and /api/me
(async ()=>{
  const base = process.env.SERVER_BASE || 'https://wispa-real-estate-2ew3.onrender.com';
  function log(){ console.log.apply(console, arguments); }
  try{
    const db = await fetch(base + '/db-test');
    log('/db-test status', db.status);
    try{ const dj = await db.json(); log('/db-test body', dj); }catch(e){ log('/db-test parse error'); }
  }catch(e){ log('/db-test failed', e && e.message); }

  const creds = { username: 'testuser_ci', email: 'testuser_ci@example.com', password: 'TestPass123!' };
  try{
    const s = await fetch(base + '/api/signup', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(creds) });
    log('/signup status', s.status);
    try{ const sj = await s.json(); log('/signup body', sj); }catch(e){ log('/signup no-json'); }
  }catch(e){ log('/signup failed', e && e.message); }

  try{
    const l = await fetch(base + '/api/login', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ username: creds.username, password: creds.password }), redirect: 'manual' });
    log('/login status', l.status);
    let setCookie = null;
    try{ setCookie = l.headers.get('set-cookie'); }catch(e){}
    log('set-cookie header:', setCookie);
    try{ const lj = await l.json(); log('/login body', lj); }catch(e){ log('/login non-json'); }

    if (setCookie) {
      const me = await fetch(base + '/api/me', { headers: { cookie: setCookie } });
      log('/me status', me.status);
      try{ const mj = await me.json(); log('/me body', mj); }catch(e){ log('/me non-json'); }
    } else {
      log('No set-cookie header observed; server may not be setting cookie or cross-site cookie blocked.');
    }
  }catch(e){ log('login error', e && e.message); process.exit(1); }
})();
