(async()=>{
  const base = process.env.SERVER_BASE || 'https://wispa-real-estate-2ew3.onrender.com';
  const log = (label, v) => console.log('---', label, '---\n', v);
  try{
    const r = await fetch(base + '/api/me');
    log('/api/me status', r.status);
    try{ const j = await r.json(); log('/api/me body', JSON.stringify(j, null, 2)); }catch(e){ log('/api/me body', 'non-json or empty'); }
  }catch(e){ log('/api/me error', e.message); }

  try{
    const r = await fetch(base + '/api/properties');
    log('/api/properties status', r.status);
    try{ const j = await r.json(); log('/api/properties body', Array.isArray(j) ? ('array len=' + j.length) : JSON.stringify(j, null, 2)); }catch(e){ log('/api/properties body', 'non-json'); }
  }catch(e){ log('/api/properties error', e.message); }

  try{
    const payload = { property: { title: 'Smoke Test Prop ' + Date.now(), type: 'Apartment', sale_rent: 'sale', price: 11111, location: 'Smoke City' }, photoUrls: [] };
    const p = await fetch(base + '/api/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    log('/api/properties POST status', p.status);
    try{ const j = await p.json(); log('/api/properties POST body', JSON.stringify(j, null, 2)); }catch(e){ log('/api/properties POST body', 'non-json'); }
  }catch(e){ log('/api/properties POST error', e.message); }
})();