// Storage sync shim: provide a cached, synchronous localStorage-like API backed by /api/storage.
(function(){
  try{
    // in-memory cache of storage values (string form).
    window._storageCache = window._storageCache || {};

    // Load server KV store into cache asynchronously on startup.
    (async function loadRemote(){
      try{
        // Allow opt-out for static deployments without server KV
        if (window.WISPA_SKIP_STORAGE_SYNC) return;
        const base = (window.WISPA_API_BASE || '').replace(/\/$/, '');
        const url = base ? (base + '/api/storage/all') : '/api/storage/all';
        const r = await fetch(url, { credentials: 'include' });
        // If storage endpoint is not present (404) or not ok, simply skip without throwing
        if (!r || !r.ok) return;
        const j = await r.json();
        if (j && j.store){ Object.keys(j.store).forEach(k => {
            try{
              const v = j.store[k];
              // store stringified JSON for compatibility with localStorage.getItem
              window._storageCache[k] = (typeof v === 'string' || typeof v === 'number') ? String(v) : JSON.stringify(v);
            }catch(e){}
        }); }
      }catch(e){}
    })();

    const proto = Storage.prototype;

    // Synchronous read from cache (matches localStorage.getItem behaviour)
    try{ proto.getItem = function(k){ try{ if(window._storageCache && Object.prototype.hasOwnProperty.call(window._storageCache, k)) return window._storageCache[k]; return null; }catch(e){ return null; } }; }catch(e){}

    // Writes update cache immediately and POST to server KV asynchronously
    try{ proto.setItem = function(k, val){ try{ window._storageCache = window._storageCache || {}; window._storageCache[k] = String(val);
          // attempt to JSON-parse value to preserve structure in DB
          let parsed = val;
          try{ parsed = JSON.parse(val); }catch(e){ parsed = val; }
          try{
            const toSend = (typeof parsed === 'string' || typeof parsed === 'number') ? parsed : JSON.stringify(parsed);
            const _b = (window.WISPA_API_BASE || '').replace(/\/$/, ''); const _u = _b ? (_b + '/api/storage') : '/api/storage';
            fetch(_u, { method: 'POST', credentials: 'include', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ key: k, value: toSend }) }).catch(()=>{});
          }catch(e){}
        }catch(e){} }; }catch(e){}

    // removeItem deletes from cache and attempts to delete on server
    try{ proto.removeItem = function(k){ try{ if(window._storageCache) delete window._storageCache[k]; try{ const _b = (window.WISPA_API_BASE || '').replace(/\/$/, ''); const _u = _b ? (_b + '/api/storage') : '/api/storage'; fetch(_u, { method: 'POST', credentials: 'include', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ key: k, value: null }) }).catch(()=>{}); }catch(e){} }catch(e){} }; }catch(e){}

    // clear cache locally; do not attempt to wipe server storage automatically
    try{ proto.clear = function(){ try{ window._storageCache = {}; }catch(e){} }; }catch(e){}

  }catch(e){}
})();
