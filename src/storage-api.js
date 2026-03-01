// Async-safe storage helper that wraps the server KV endpoints and the in-memory cache.
(function(){
  if (typeof window === 'undefined') return;

  window.storageApi = window.storageApi || {};

  async function ensureLoaded(){
    if (window._storageCache && Object.keys(window._storageCache).length>0) return;
    try{
      const r = await fetch('/api/storage/all', { credentials: 'include' });
      if(r && r.ok){ const j = await r.json(); window._storageCache = window._storageCache || {}; if(j && j.store){ Object.keys(j.store).forEach(k => {
        try{ const v = j.store[k]; window._storageCache[k] = (typeof v === 'string' || typeof v === 'number') ? String(v) : JSON.stringify(v); }catch(e){}
      }); }}
    }catch(e){}
  }

  // Async get: returns parsed value when possible, otherwise raw string/null
  window.storageApi.get = async function(key){
    try{ await ensureLoaded(); if(window._storageCache && Object.prototype.hasOwnProperty.call(window._storageCache, key)){
      const raw = window._storageCache[key]; try{ return JSON.parse(raw); }catch(e){ return raw; }
    } }
    catch(e){}
    // Try server if not in cache
    try{
      const r = await fetch('/api/storage/all', { credentials: 'include' });
      if(r && r.ok){ const j = await r.json(); if(j && j.store && Object.prototype.hasOwnProperty.call(j.store, key)){
        const v = j.store[key]; if(typeof v === 'string' || typeof v === 'number') return v; if(v && v.value !== undefined) return v.value; return v;
      }}
    }catch(e){}
    return null;
  };

  // Sync get from cache only (for legacy synchronous callsites)
  window.storageApi.getSync = function(key){
    try{ if(window._storageCache && Object.prototype.hasOwnProperty.call(window._storageCache, key)){
      const raw = window._storageCache[key]; try{ return JSON.parse(raw); }catch(e){ return raw; }
    } }catch(e){}
    return null;
  };

  // Async set: updates cache and writes to server
  window.storageApi.set = async function(key, value){
    try{
      window._storageCache = window._storageCache || {};
      window._storageCache[key] = (typeof value === 'string' || typeof value === 'number') ? String(value) : JSON.stringify(value);
    }catch(e){}
    try{
      const body = { key: key, value: value };
      await fetch('/api/storage', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      return true;
    }catch(e){ return false; }
  };

  window.storageApi.remove = async function(key){
    try{ if(window._storageCache) delete window._storageCache[key]; }catch(e){}
    try{ await fetch('/api/storage', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key: key, value: null }) }); return true; }catch(e){ return false; }
  };

  // Convenience: get all keys (uses cache)
  window.storageApi.keys = function(){ try{ return Object.keys(window._storageCache || {}); }catch(e){ return []; } };

})();
