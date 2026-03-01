// Storage sync shim: load server-backed KV store and proxy localStorage to it.
(function(){
  // Only run when the app intends DB-only mode. Still usable if flag absent.
  try{
    // DB-only mode: do not keep local copies. Force localStorage reads to return null
    const proto = Storage.prototype;
    try{ proto.getItem = function(k){ return null; }; }catch(e){}
    try{ proto.setItem = function(k, val){ try{ let parsed = val; try{ parsed = JSON.parse(val); }catch(e){ parsed = val; } fetch('/api/storage', { method: 'POST', credentials: 'include', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ key: k, value: parsed }) }).catch(()=>{}); }catch(e){} }; }catch(e){}
    try{ proto.removeItem = function(k){ try{ fetch('/api/storage', { method: 'POST', credentials: 'include', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ key: k, value: null }) }).catch(()=>{}); }catch(e){} }; }catch(e){}
    try{ proto.clear = function(){ /* no-op in DB-only mode */ }; }catch(e){}
  }catch(e){}
})();
