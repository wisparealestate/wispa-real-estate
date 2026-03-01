// Storage sync shim: load server-backed KV store and proxy localStorage to it.
(function(){
  // Only run when the app intends DB-only mode. Still usable if flag absent.
  try{
    const DB_ONLY = true; // enforce server-backed storage replacement
    // fetch all stored keys from server
    async function init(){
      const map = {};
      try{
        const r = await fetch('/api/storage/all', { credentials: 'include' });
        if(r && r.ok){
          const j = await r.json();
          if(j && j.store) Object.assign(map, j.store);
        }
      }catch(e){ /* leave map empty */ }

      // helper: send updates to server
      async function syncKey(k, v){
        try{
          await fetch('/api/storage', { method: 'POST', credentials: 'include', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ key: k, value: v }) });
        }catch(e){}
      }

      // Provide synchronous localStorage-compatible functions backed by in-memory map
      try{
        const inMemory = map;
        // override getItem/setItem/removeItem/clear on prototype so existing code continues to use same API
        const proto = Storage.prototype;
        try{ proto.getItem = function(k){ try{ const v = inMemory[k]; if(v === undefined || v === null) return null; return (typeof v === 'string') ? v : JSON.stringify(v); }catch(e){ return null; } }; }catch(e){}
        try{ proto.setItem = function(k, val){ try{ let parsed = val; try{ parsed = JSON.parse(val); }catch(e){ parsed = val; } inMemory[k] = parsed; syncKey(k, parsed); }catch(e){} }; }catch(e){}
        try{ proto.removeItem = function(k){ try{ delete inMemory[k]; syncKey(k, null); }catch(e){} }; }catch(e){}
        try{ proto.clear = function(){ try{ Object.keys(inMemory).forEach(k=>{ delete inMemory[k]; syncKey(k, null); }); }catch(e){} }; }catch(e){}

        // expose server snapshot for debugging
        try{ window.__serverStorage = inMemory; }catch(e){}
      }catch(e){}
    }
    // initialize asynchronously but override methods even if init not finished
    init();
  }catch(e){}
})();
