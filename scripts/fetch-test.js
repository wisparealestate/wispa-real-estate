(async ()=>{
  try{
    const urls = ['http://localhost:3001/api/system-alerts', 'http://localhost:3001/api/properties', 'http://localhost:3001/api/users'];
    for(const u of urls){
      try{
        const r = await fetch(u, { credentials: 'include' });
        console.log('URL:', u, 'STATUS:', r.status);
        const ct = r.headers.get('content-type') || '';
        if(ct.indexOf('application/json')!==-1){ const j = await r.json().catch(e=>null); console.log('BODY:', JSON.stringify(j).slice(0,1000)); }
        else { const t = await r.text().catch(()=>null); console.log('BODY:', String(t).slice(0,1000)); }
      }catch(e){ console.error('FETCH ERROR', u, e && e.message ? e.message : e); }
    }
  }catch(e){ console.error('TEST FAILED', e && e.message ? e.message : e); }
})();
