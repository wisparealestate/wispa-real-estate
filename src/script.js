// Provide a site-wide API base and apiFetch helper so pages (property-detail, etc.)
// call the deployed backend when the frontend is served from a different origin.
// Default API base: use configured value or the production host. Do NOT
// automatically switch to localhost—this app is DB/API-only in production.
const _defaultRemote = 'https://wispa-real-estate-2ew3.onrender.com';
const _configured = window.WISPA_API_BASE || _defaultRemote;
window.WISPA_API_BASE = window.WISPA_API_BASE || _configured;
// Ensure legacy pages that use `API_URL` pick up the same base.
window.API_URL = window.API_URL || window.WISPA_API_BASE;
// Ensure small helpers exist globally: normalize image URLs and escape HTML
window.normalizeImageUrl = window.normalizeImageUrl || function(u){
    try{ if(!u) return u; const s = String(u).trim(); if(s.indexOf('data:')===0) return s; if(location && location.protocol === 'https:'){ if(s.startsWith('http://')) return s.replace(/^http:/,'https:'); if(s.startsWith('//')) return 'https:' + s; } return s; }catch(e){ return u; }
};
window.escapeHtml = window.escapeHtml || function(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
if (!window.apiFetch) {
    window.apiFetch = async function(url, opts) {
        const API_BASE = (window.WISPA_API_BASE || '').replace(/\/$/, '');
        try {
            // if no API_BASE configured, just use fetch
            if (!API_BASE) {
                return await fetch(url, opts);
            }
            // prefer same-origin calls for /api/ paths, then fall back to configured backend
                    if (typeof url === 'string' && url.startsWith('/api/')) {
                        const finalOpts = Object.assign({}, opts || {}, { credentials: 'include' });
                        const orig = (location && location.origin) ? String(location.origin).replace(/\/+$/,'') : '';
                        const apiBaseIsRemote = Boolean(API_BASE) && (API_BASE !== '' ) && (API_BASE !== orig);
                        // If a configured API base exists and is different from the frontend origin,
                        // prefer calling the API base directly (this avoids 404s when frontend
                        // is hosted as static site without API routes).
                        if(apiBaseIsRemote){
                            try{
                                const r = await fetch(API_BASE + url, finalOpts);
                                try {
                                    if (r && r.status === 401 && String(url).startsWith('/api/admin')) window._wispaAdminUnauthorized = true;
                                    if (r && r.ok && String(url).startsWith('/api/admin')) window._wispaAdminUnauthorized = false;
                                } catch(e){}
                                return r;
                            }catch(e){ /* fallthrough to try same-origin as last resort */ }
                        }
                        // Otherwise (same-origin or no API_BASE), try same-origin first, then fallback to API_BASE
                        try{
                            const localRes = await fetch(url, finalOpts);
                            if (localRes) {
                                try {
                                    if (localRes && localRes.status === 401 && String(url).startsWith('/api/admin')) window._wispaAdminUnauthorized = true;
                                    if (localRes && localRes.ok && String(url).startsWith('/api/admin')) window._wispaAdminUnauthorized = false;
                                } catch(e){}
                                if (localRes.status !== 404) return localRes;
                            }
                        }catch(e){}
                        try{
                            const r = await fetch(API_BASE + url, finalOpts);
                            try {
                                if (r && r.status === 401 && String(url).startsWith('/api/admin')) window._wispaAdminUnauthorized = true;
                                if (r && r.ok && String(url).startsWith('/api/admin')) window._wispaAdminUnauthorized = false;
                            } catch(e){}
                            return r;
                        }catch(e){ return null; }
                    }
                    // otherwise try same-origin then fallback to API_BASE
                    try { const r = await fetch(url, opts); if (r && r.ok) return r; } catch(e){}
                    try {
                        const finalOpts2 = Object.assign({}, opts || {}, { credentials: 'include' });
                        const res2 = await fetch(API_BASE + url, finalOpts2);
                        // If the API indicates unauthorized, mark a global flag only for admin routes
                        try {
                            if (res2 && res2.status === 401 && String(url).startsWith('/api/admin')) {
                                window._wispaAdminUnauthorized = true;
                            }
                            if (res2 && res2.ok && String(url).startsWith('/api/admin')) {
                                window._wispaAdminUnauthorized = false;
                            }
                        } catch (e) {}
                        return res2;
                    } catch (e) { return null; }
        } catch (e) { return null; }
    };
}

// Allow pages (or login flows) to clear the admin-unauthorized backoff and
// attempt pending admin actions again after an admin signs in.
window.clearAdminUnauthorized = function() {
    try { window._wispaAdminUnauthorized = false; } catch(e) {}
    try { if (typeof processPendingNotifications === 'function') processPendingNotifications(); } catch(e) {}
};

    // Debug helper: test admin auth from the browser and log response details
    window.debugAdminAuth = async function(){
        try{
            const base = window.WISPA_API_BASE || '';
            const url = (base.replace(/\/+$/,'') || '') + '/api/admin/sent-notifications';
            console.log('debugAdminAuth ->', url);
            const r = await fetch(url, { method: 'GET', credentials: 'include' });
            console.log('debugAdminAuth status:', r.status);
            try{ for (const h of r.headers) console.log('header:', h[0], h[1]); }catch(e){}
            const body = await r.text();
            console.log('debugAdminAuth body:', body);
            return { status: r.status, body };
        }catch(err){ console.error('debugAdminAuth error', err); return { error: String(err) }; }
    };

    // Debug helper for regular user session (calls /api/me)
    window.debugUserAuth = async function(){
        try{
            const base = window.WISPA_API_BASE || '';
            const url = (base.replace(/\/+$/,'') || '') + '/api/me';
            console.log('debugUserAuth ->', url);
            const r = await fetch(url, { method: 'GET', credentials: 'include' });
            console.log('debugUserAuth status:', r.status);
            const body = await r.text();
            console.log('debugUserAuth body:', body);
            return { status: r.status, body };
        }catch(err){ console.error('debugUserAuth error', err); return { error: String(err) }; }
    };

    // Attempt cross-origin admin login via API host and open the URL that sets the session cookie.
    // Usage: await window.adminLoginRedirect('admin','password');
    window.adminLoginRedirect = async function(username, password, returnTo){
        try{
            if(!username || !password) throw new Error('username and password required');
            const base = (window.WISPA_API_BASE || '').replace(/\/+$/,'') || '';
            const resp = await fetch(base + '/api/admin-login-redirect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password, returnTo: returnTo || '/admin.html' })
            });
            const j = await resp.json();
            if(j && j.url){
                // open the URL on API host which will set the cookie and redirect back
                window.open(j.url, '_blank');
                return j.url;
            }
            throw new Error('Login redirect failed: ' + JSON.stringify(j));
        }catch(e){ console.error('adminLoginRedirect error', e); throw e; }
    };

    // Prompt helper for quick use from Console: prompts for username/password and triggers redirect flow.
    window.adminLoginPrompt = async function(){
        try{
            const u = prompt('Admin username'); if(!u) return;
            const p = prompt('Admin password'); if(!p) return;
            await window.adminLoginRedirect(u,p, '/admin.html');
            alert('Opened API host to set admin session. Complete login in the new tab.');
        }catch(e){ alert('admin login failed: ' + (e && e.message ? e.message : String(e))); }
    };

// Disable localStorage usage in DB-only mode only when explicitly configured.
// Setting `window.WISPA_DISABLE_LOCALSTORAGE = true` or `window.WISPA_DB_ONLY = true`
// will turn reads into no-ops to prevent accidental client-side persistence.
try {
    const noop = function(){ return null; };
    const noWrite = function(){ /* no-op in DB-only mode */ };
    // Only override localStorage when a deliberate flag is present.
    if (typeof localStorage !== 'undefined' && (window.WISPA_DISABLE_LOCALSTORAGE || window.WISPA_DB_ONLY)) {
        try { localStorage.getItem = noop; } catch(e){}
        try { localStorage.setItem = noWrite; } catch(e){}
        try { localStorage.removeItem = noWrite; } catch(e){}
        try { localStorage.clear = noWrite; } catch(e){}
    }
} catch(e) {}


// Always load window.properties from API on page load (DB-only mode)
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const r = window.apiFetch ? await window.apiFetch('/api/properties') : await fetch('/api/properties');
        if (r && r.ok) {
            const j = await r.json();
            window.properties = Array.isArray(j) ? j : (j && j.properties) ? j.properties : [];
        } else {
            window.properties = [];
        }
    } catch (e) { window.properties = []; }
    // After loading properties, attempt to process any locally-stored photos (upload & migrate to remote)
    try { processLocalPhotosQueue(); } catch (e) { console.warn('processLocalPhotosQueue init failed', e); }

    // Initialize attach + emoji controls but only inject into conversation input areas
    try{
        // hidden file input used by local attach buttons
        if (!document.getElementById('wispa-global-file-input')){
            const hidden = document.createElement('input');
            hidden.id = 'wispa-global-file-input';
            hidden.type = 'file';
            hidden.multiple = true;
            hidden.style.display = 'none';
            document.body.appendChild(hidden);
            window._wispaPendingFiles = [];
            hidden.addEventListener('change', async (e)=>{
                const files = Array.from(e.target.files || []);
                if(files.length) {
                    window._wispaPendingFiles = files;
                }
                e.target.value = '';
            });
        }

        // Emoji set used for picker
        const emojis = ['📄','🖼️','🏢','💼','📈','📊','🧾','📝','📨','📞'];

        // Helper to add controls into a chat input area (places them before the send button)
        function addControlsToInput(inputEl){
            if(!inputEl || inputEl._wispaControlsAttached) return;
            const parent = inputEl.parentNode;
            if(!parent) return;
            // If the chat container already provides file/emoji controls (e.g., admin view), do not inject duplicates
            try{
                if(parent.querySelector('#fileInput') || parent.querySelector('#emojiBtn') || parent.querySelector('input[type=file]') ){
                    inputEl._wispaControlsAttached = true; // mark as handled
                    return;
                }
            }catch(e){}
            // find send button in same container
            const sendBtn = Array.from(parent.querySelectorAll('button')).find(b => b.id === 'sendBtn' || b.textContent.trim().toLowerCase() === 'send' || b.getAttribute('onclick') && b.getAttribute('onclick').toLowerCase().includes('send'));
            // create controls wrapper
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '6px';
            wrap.style.marginRight = '6px';

            const attach = document.createElement('button');
            attach.type = 'button';
            attach.title = 'Attach files';
            attach.textContent = '📎';
            attach.style.background = 'transparent';
            attach.style.border = 'none';
            attach.style.cursor = 'pointer';
            attach.style.fontSize = '18px';

            const emojiBtn = document.createElement('button');
            emojiBtn.type = 'button';
            emojiBtn.title = 'Emoji picker';
            emojiBtn.textContent = '😊';
            emojiBtn.style.background = 'transparent';
            emojiBtn.style.border = 'none';
            emojiBtn.style.cursor = 'pointer';
            emojiBtn.style.fontSize = '18px';

            // emoji picker element
            const picker = document.createElement('div');
            picker.style.display = 'none';
            picker.style.position = 'absolute';
            picker.style.background = '#fff';
            picker.style.border = '1px solid #e6eef6';
            picker.style.padding = '6px';
            picker.style.borderRadius = '6px';
            picker.style.boxShadow = '0 8px 24px rgba(8,24,50,0.08)';
            picker.style.zIndex = '9999';
            picker.setAttribute('aria-hidden','true');

            for(const em of emojis){ const b = document.createElement('button'); b.type='button'; b.textContent=em; b.style.background='transparent'; b.style.border='none'; b.style.fontSize='18px'; b.style.cursor='pointer'; b.style.margin='4px'; b.addEventListener('click', ()=>{
                const active = inputEl; const ok = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
                if(ok){
                    try{
                        const el = active;
                        const start = el.selectionStart || el.value.length || 0; const end = el.selectionEnd || start;
                        const val = el.value || el.innerText || '';
                        const newVal = val.slice(0,start) + em + val.slice(end);
                        if(el.value !== undefined) { el.value = newVal; el.selectionStart = el.selectionEnd = start + em.length; el.focus(); }
                        else { el.innerText = newVal; }
                    }catch(e){}
                } else {
                    try { navigator.clipboard.writeText(em); } catch(e){}
                }
                picker.style.display = 'none';
            }); picker.appendChild(b); }

            // attach click handlers
            attach.addEventListener('click', ()=>{
                const hidden = document.getElementById('wispa-global-file-input'); if(hidden) hidden.click();
                // small visual feedback: show count if files already selected
                try{ const files = window._wispaPendingFiles || []; if(files.length){ attach.textContent = '📎(' + files.length + ')'; setTimeout(()=>{ attach.textContent = '📎'; }, 2500); } }catch(e){}
            });
            emojiBtn.addEventListener('click', (ev)=>{
                // position picker relative to the button
                if(picker.style.display === 'block') { picker.style.display='none'; return; }
                const rect = emojiBtn.getBoundingClientRect();
                picker.style.display = 'block';
                picker.style.left = (rect.left) + 'px';
                picker.style.top = (rect.top - rect.height - 10) + 'px';
            });

            // ensure parent is positioned to allow absolute picker placement
            if(getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

            wrap.appendChild(attach);
            wrap.appendChild(emojiBtn);
            parent.insertBefore(wrap, sendBtn || inputEl.nextSibling);
            parent.appendChild(picker);
            inputEl._wispaControlsAttached = true;
        }

        // find known conversation input elements and attach controls
        const selectors = ['#chatInput', '#propertyDetailChatInput', 'input[data-wispa-chat]', 'textarea[data-wispa-chat]'];
        selectors.forEach(sel => {
            const el = document.querySelector(sel);
            if(el) addControlsToInput(el);
        });

        // also observe DOM for chat inputs added later (e.g., modals)
        const obs = new MutationObserver((mut)=>{
            for(const m of mut){
                for(const n of m.addedNodes){
                    try{ if(n && n.querySelector){ const found = n.querySelector('#chatInput, #propertyDetailChatInput, input[data-wispa-chat], textarea[data-wispa-chat]'); if(found) addControlsToInput(found); } }catch(e){}
                }
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }catch(e){ console.warn('chat controls init failed', e); }
});

// Convert a dataURL to a Blob
function dataURLToBlob(dataURL){
    try{
        const parts = dataURL.split(',');
        const meta = parts[0];
        const b64 = parts[1];
        const mime = meta.match(/:(.*?);/)[1] || 'application/octet-stream';
        const byteChars = atob(b64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mime });
    }catch(e){ return null; }
}

// Convert a File to a dataURL, compressing images via canvas when appropriate
window.fileToDataUrlWithCompression = window.fileToDataUrlWithCompression || async function(file, opts){
    opts = Object.assign({ maxWidth: 1280, quality: 0.8 }, opts || {});
    if(!file) return null;
    // Only attempt canvas compression for images
    try{
        if(file.type && file.type.indexOf('image/') === 0 && typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined'){
            const imgUrl = URL.createObjectURL(file);
            const img = await new Promise((resolve, reject)=>{
                const i = new Image(); i.onload = ()=>{ resolve(i); }; i.onerror = (e)=>{ reject(e); }; i.src = imgUrl; 
            });
            try{ URL.revokeObjectURL(imgUrl); }catch(e){}
            const canvas = document.createElement('canvas');
            const ratio = Math.min(1, opts.maxWidth / img.width);
            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const mime = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
            const dataUrl = canvas.toDataURL(mime, opts.quality);
            return dataUrl;
        }
    }catch(e){ /* continue to simple read fallback */ }
    // Fallback: read as data URL without compression
    return await new Promise((resolve)=>{
        try{
            const r = new FileReader(); r.onload = ()=>resolve(r.result); r.onerror = ()=>resolve(null); r.readAsDataURL(file);
        }catch(e){ resolve(null); }
    });
};

// Upload data: photos stored under a localPhotos_<key> storage key and attach remote URLs back to property
async function uploadLocalPhotosForProperty(property){
    if(!property || !property._localPhotosKey) return null;
    const key = property._localPhotosKey;
    let stored = null;
    try{ stored = JSON.parse(localStorage.getItem(key) || 'null'); }catch(e){ stored = null; }
    if(!stored || !Array.isArray(stored) || stored.length===0) return null;
    // convert to blobs
    const blobs = stored.map(d => dataURLToBlob(d)).filter(Boolean);
    if(!blobs.length) return null;
    try{
        const form = new FormData();
        blobs.forEach((b,idx)=>{
            let ext = 'bin';
            try{ if(b && b.type){ const parts = b.type.split('/'); if(parts[1]) ext = parts[1].split('+')[0]; } }catch(e){}
            const name = `file-${Date.now()}-${idx}.${ext}`;
            form.append('files', b, name);
        });
        const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
        const resp = await poster('/api/upload-photos', { method: 'POST', body: form });
        if(!resp || !resp.ok) throw new Error('upload failed');
        const j = await resp.json();
        const urls = Array.isArray(j.urls) ? j.urls : (j && j.uploaded ? j.uploaded : []);
        if(urls && urls.length){
            // replace local photos with remote urls on the property
            property.images = urls;
            property.photoUrls = urls;
            // remove local marker
            delete property._localPhotosKey;
            // persist locally
            try{
                // update window.properties and localStorage copy
                if(Array.isArray(window.properties)){
                    const idx = window.properties.findIndex(p => String(p.id) === String(property.id));
                    if(idx>-1) window.properties[idx] = property;
                    try{ localStorage.setItem('properties', JSON.stringify(window.properties)); }catch(e){}
                }
            }catch(e){}
            // attempt to save to server so remote property record includes photos
            try{ await saveProperty(Object.assign({}, property, { photos: urls })); }catch(e){ /* ignore */ }
            // remove stored data-urls to free space
            try{ localStorage.removeItem(key); }catch(e){}
            return urls;
        }
    }catch(e){ console.warn('uploadLocalPhotosForProperty error', e); }
    return null;
}

// Process all properties with local photos and try to upload them
async function processLocalPhotosQueue(){
    try{
        const props = Array.isArray(window.properties) ? window.properties : (function(){ try{ const s = localStorage.getItem('properties'); return s ? JSON.parse(s) : []; }catch(e){ return []; } })();
        if(!Array.isArray(props) || !props.length) return;
        for(const p of props){
            if(p && p._localPhotosKey){
                // only attempt when online to reduce failures
                if(typeof navigator !== 'undefined' && navigator.onLine === false) continue;
                await uploadLocalPhotosForProperty(p);
            }
        }
    }catch(e){ console.warn('processLocalPhotosQueue failed', e); }
}

// Trigger processing when network becomes available
window.addEventListener('online', () => { try{ processLocalPhotosQueue(); }catch(e){} });
// Also poll occasionally
try{ setInterval(()=>{ try{ processLocalPhotosQueue(); }catch(e){} }, 60000); }catch(e){}

// Resolve images for a property: prioritize localPhotos stored under _localPhotosKey,
// then photoUrls/photos, then images array, then single image field.
function resolvePropertyImages(property){
    try{
        if(!property) return [];
        if(property._localPhotosKey){
            try{ const raw = localStorage.getItem(property._localPhotosKey); if(raw){ const arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length) return arr; } }catch(e){}
        }
        if(Array.isArray(property.photoUrls) && property.photoUrls.length) return property.photoUrls;
        if(Array.isArray(property.photos) && property.photos.length) return property.photos;
        if(Array.isArray(property.images) && property.images.length) return property.images;
        if(property.image) return [property.image];
        return [];
    }catch(e){ return []; }
}

// Process pending admin notifications stored in localStorage under 'pendingNotifications'
async function processPendingNotifications(force = false){
    try{
        // Attempt pending admin POSTs. Callers may pass `force = true` to bypass retries.
        const key = 'pendingNotifications';
        let pending = [];
        try{ pending = JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){ pending = []; }
        if(!Array.isArray(pending) || pending.length === 0) return;
        if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
        const remaining = [];
        for(const item of pending){
            try{
                const resp = await poster('/api/admin/sent-notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: item.title, body: item.body, data: item.data }) });
                if(resp && resp.ok){
                    // success — skip
                    continue;
                } else {
                    item.attempts = (item.attempts || 0) + 1;
                    remaining.push(item);
                }
            }catch(e){
                item.attempts = (item.attempts || 0) + 1;
                remaining.push(item);
            }
        }
        try{ localStorage.setItem(key, JSON.stringify(remaining)); }catch(e){}
    }catch(e){ console.warn('processPendingNotifications failed', e); }
}

// Retry pending notifications on network online and periodically
window.addEventListener('online', () => { try{ processPendingNotifications(); }catch(e){} });
// Helper to explicitly retry pending admin notifications (forces retry even during backoff)
window.retryPendingNotifications = async function(){
    try{ window.clearAdminUnauthorized && window.clearAdminUnauthorized(); }catch(e){}
    try{ return await processPendingNotifications(true); }catch(e){ console.error('retryPendingNotifications failed', e); }
};
try{ setInterval(()=>{ try{ processPendingNotifications(); }catch(e){} }, 60000); }catch(e){}
// Helper to get current authenticated user from server (caches result in-memory)
window._wispaCurrentUser = null;
window.getCurrentUser = async function(force){
    if(window._wispaCurrentUser && !force) return window._wispaCurrentUser;
    try{
        // If we're on an admin page, prefer the admin-profile endpoint first
        const href = (typeof window !== 'undefined' && window.location) ? String(window.location.href || '') : '';
        const path = (typeof window !== 'undefined' && window.location) ? String(window.location.pathname || '') : '';
        const isAdminPage = (href.indexOf('admin.html') !== -1) || (path.indexOf('/admin') !== -1) || (path.indexOf('admin') !== -1);
        if (isAdminPage && window.apiFetch) {
            try{
                const ar = await window.apiFetch('/api/admin/profile');
                if (ar && ar.ok) {
                    const aj = await ar.json();
                    // Normalise common shapes: { user }, { profile }, or direct user object
                    const adminUser = (aj && (aj.user || aj.profile || aj.admin)) || (aj && typeof aj === 'object' && (aj.id || aj.email) ? aj : null);
                    if (adminUser) { window._wispaCurrentUser = adminUser; return adminUser; }
                }
            }catch(e){}
        }

        // Fallback to standard /api/me
        const r = window.apiFetch ? await window.apiFetch('/api/me') : await fetch('/api/me');
        if(r && r.ok){ const j = await r.json(); if(j && j.user){ window._wispaCurrentUser = j.user; return j.user; } else if (j && (j.id || j.email)) { window._wispaCurrentUser = j; return j; } }
    }catch(e){}
    window._wispaCurrentUser = null;
    return null;
};

// Save admin profile (tries admin endpoint then falls back to /api/me)
window.saveAdminProfile = async function(profile){
    try{
        const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
        // Try admin endpoint first - send profile object directly
        try{
            const r = await poster('/api/admin/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
            if(r && r.ok) return await r.json();
        }catch(e){}
        // Fallback to /api/me update
        try{
            const r2 = await poster('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
            if(r2 && r2.ok) return await r2.json();
        }catch(e){}
        throw new Error('Profile save failed');
    }catch(err){ console.error('saveAdminProfile failed', err); throw err; }
};

// Ensure user is authenticated or redirect to login
window.requireLogin = async function(){
    const u = await window.getCurrentUser();
    if(!u){ window.location.href = 'login.html'; return null; }
    return u;
};
// Render admin chat list in the chat tab

// Open chat conversation in fullview
async function openAdminChat(chatId) {
    console.log('openAdminChat called for', chatId);
    // Attempt to load messages from server first (DB-backed messages), fallback to localStorage
    let messages = [];
    let chat = null;
    try {
        if (window.apiFetch) {
            console.log('openAdminChat: attempting server fetch for', chatId);
            try {
                const res = await window.apiFetch('/api/conversations/' + encodeURIComponent(chatId) + '/messages');
                console.log('openAdminChat: server fetch status', res && res.status);
                if (res && res.ok) {
                    const j = await res.json();
                        const rows = Array.isArray(j.messages) ? j.messages : (Array.isArray(j) ? j : []);
                        console.log('openAdminChat: server returned messages count', rows && rows.length);
                        if (rows && rows.length) {
                            messages = rows.map(r => {
                                let meta = null;
                                try { meta = (typeof r.meta === 'string') ? JSON.parse(r.meta) : r.meta; } catch(e){ meta = r.meta || null }
                                return {
                                    sender: (r.sender || (meta && meta.sender) || 'user'),
                                    text: (r.text || r.body || r.content || (meta && (meta.text || meta.body)) || ''),
                                    timestamp: (r.timestamp || r.sent_at || r.sentAt || r.created_at || null),
                                    userId: (r.userId || r.sender_id || r.user_id || (meta && (meta.userId || meta.user_id)) || null),
                                    userEmail: (r.userEmail || (meta && (meta.userEmail || meta.user_email)) || r.user_email || r.email || null),
                                    userName: (r.userName || (meta && (meta.userName || meta.user_name)) || r.user_name || r.userName || null),
                                    meta: meta || null
                                };
                            });
                        // sort by timestamp ascending
                        messages.sort((a,b)=>{ const ta = new Date(a.timestamp).getTime()||0; const tb = new Date(b.timestamp).getTime()||0; return ta - tb; });
                        // derive chat meta from first message and prefer API-provided property payload
                        const first = messages[0];
                        const apiProperty = (j && j.property) ? j.property : null;
                        chat = {
                            id: chatId,
                            userName: first.userName || (first.meta && (first.meta.userName || first.meta.user_name)) || null,
                            userEmail: first.userEmail || (first.meta && (first.meta.userEmail || first.meta.user_email)) || null,
                            userId: first.userId || null,
                            conversationTitle: (apiProperty && (apiProperty.title || apiProperty.name)) || (first.meta && first.meta.property && first.meta.property.title) || null,
                            conversationProperty: apiProperty || (first.meta && first.meta.property) || null
                        };
                        // If API didn't include a userName, try to preserve a locally-known participantName
                        try{
                            if((!chat.userName || String(chat.userName).toLowerCase() === 'user')){
                                const ac = JSON.parse(localStorage.getItem('adminChats') || '[]');
                                const found = (ac || []).find(a => a.id === chatId);
                                if(found && found.participantName) chat.userName = found.participantName;
                            }
                        }catch(e){}
                    }
                }
            } catch(e) { /* ignore and fallback */ }
            // If server fetch returned empty, try listing conversations to resolve partial ids
            try{
                if ((!messages || messages.length === 0) && window.apiFetch) {
                    console.log('openAdminChat: attempting to resolve id via /api/conversations');
                    const listRes = await window.apiFetch('/api/conversations');
                    if (listRes && listRes.ok) {
                        const lj = await listRes.json();
                        const convs = Array.isArray(lj.conversations) ? lj.conversations : (Array.isArray(lj) ? lj : []);
                        if (Array.isArray(convs) && convs.length) {
                            const found = convs.find(c => (c.id && String(c.id).indexOf(String(chatId)) !== -1) || (c.key && String(c.key).indexOf(String(chatId)) !== -1) || (c.conversation_id && String(c.conversation_id).indexOf(String(chatId)) !== -1) );
                            if (found && found.id && found.id !== chatId) {
                                console.log('openAdminChat: resolved via server list', chatId, '->', found.id);
                                return openAdminChat(found.id);
                            }
                        }
                    }
                }
            }catch(e){ console.warn('openAdminChat: /api/conversations resolution failed', e); }
        }
    } catch(e) { /* ignore */ }

    // If server didn't return messages, fall back to localStorage merge
    if (!messages || messages.length === 0) {
        // Build all possible keys for this chatId
        const keys = [];
        keys.push('adminMessages_' + chatId);
        keys.push('wispaMessages_' + chatId);
        // Try to find userId from adminChats
        let userId = null;
        try {
            const adminChats = JSON.parse(localStorage.getItem('adminChats') || '[]');
            const meta = adminChats.find(c => c.id === chatId);
            if (meta && meta.userId) userId = meta.userId;
        } catch(e){}
        if (!userId) {
            const m = chatId.match(/^property-\d+-(WISPA-[^_]+)/);
            if (m) userId = m[1];
        }
        if (userId) {
            keys.push('wispaMessages_' + userId + '_' + chatId);
        }
        const m2 = chatId.match(/^property-(\d+)-(WISPA-[^_]+)/);
        if (m2) {
            const propertyId = m2[1];
            const userId2 = m2[2];
            keys.push('wispaMessages_' + userId2 + '_property-' + propertyId);
        }
        // Merge messages from all keys
        const seen = new Set();
        console.log('openAdminChat: checking local keys', keys);
        for (let i = 0; i < keys.length; i++) {
            const arr = localStorage.getItem(keys[i]);
            if (arr) {
                try {
                    const msgs = JSON.parse(arr);
                    if (Array.isArray(msgs)) {
                        console.log('openAdminChat: found', msgs.length, 'messages in', keys[i]);
                        msgs.forEach(m => {
                            const sig = (m.time||m.ts||'')+'|'+(m.text||'')+'|'+(m.sender||'');
                            if (!seen.has(sig)) {
                                messages.push(m);
                                seen.add(sig);
                            }
                        });
                    }
                } catch(e){}
            }
        }
        // Sort by time/ts ascending
        messages.sort((a,b) => {
            const ta = a.time || a.ts || 0;
            const tb = b.time || b.ts || 0;
            return ta - tb;
        });

        // If still empty, perform a deep scan of all localStorage entries to find messages
        if ((!messages || messages.length === 0)) {
            try {
                const seenKeys = new Set(keys);
                // derive numeric property id if possible (property-585 -> 585)
                let propNum = null;
                try {
                    const m = String(chatId).match(/^property-(\d+)/);
                    if (m) propNum = m[1];
                } catch(e){}
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || seenKeys.has(key)) continue;
                    try {
                        const raw = localStorage.getItem(key);
                        if (!raw) continue;
                        const parsed = JSON.parse(raw);
                        let candidateMsgs = [];
                        if (Array.isArray(parsed)) {
                            candidateMsgs = parsed;
                        } else if (parsed && Array.isArray(parsed.messages)) {
                            candidateMsgs = parsed.messages;
                        } else if (parsed && Array.isArray(parsed.items)) {
                            candidateMsgs = parsed.items;
                        }
                        if (!candidateMsgs || !candidateMsgs.length) continue;
                        // Filter messages that reference this property/chatId
                        const matches = candidateMsgs.filter(m => {
                            try {
                                if (!m) return false;
                                // check meta.property presence
                                if (m.meta && m.meta.property) {
                                    const pp = m.meta.property;
                                    if (pp.id && propNum && String(pp.id) === String(propNum)) return true;
                                    if (pp.id && String(pp.id).indexOf(String(chatId)) !== -1) return true;
                                    if (pp.key && String(pp.key).indexOf(String(chatId)) !== -1) return true;
                                }
                                // check message-level property
                                if (m.property) {
                                    const pp = m.property;
                                    if (pp.id && propNum && String(pp.id) === String(propNum)) return true;
                                    if (pp.id && String(pp.id).indexOf(String(chatId)) !== -1) return true;
                                }
                                // check if message id or conversation id matches chatId
                                if (m.conversationId && String(m.conversationId).indexOf(String(chatId)) !== -1) return true;
                                if (m.id && String(m.id).indexOf(String(chatId)) !== -1) return true;
                                // finally, if text contains property id or chatId
                                if (m.text && String(m.text).indexOf(String(propNum || chatId)) !== -1) return true;
                                return false;
                            } catch(e){ return false; }
                        });
                        if (matches && matches.length) {
                            console.log('openAdminChat: deep-scan found', matches.length, 'messages in', key);
                            matches.forEach(m => {
                                const sig = (m.time||m.ts||'')+'|'+(m.text||'')+'|'+(m.sender||'');
                                try { if (!seen.has(sig)) { messages.push(m); seen.add(sig); } } catch(e) { messages.push(m); }
                            });
                        }
                    } catch(e) {}
                }
                // resort if we found anything
                if (messages && messages.length) {
                    messages.sort((a,b) => { const ta = a.time || a.ts || 0; const tb = b.time || b.ts || 0; return ta - tb; });
                }
            } catch(e){ console.warn('openAdminChat: deep localStorage scan failed', e); }
        }
        // Get chat meta
        try {
            const adminChats = JSON.parse(localStorage.getItem('adminChats') || '[]');
            chat = adminChats.find(c => c.id === chatId);
        } catch(e){}
        if (!chat) {
            const chats = JSON.parse(localStorage.getItem('chatNotifications') || '[]');
            chat = chats.find(c => c.id === chatId);
        }
        if (!chat) {
            let resolved = null;
            try {
                const adminChats = JSON.parse(localStorage.getItem('adminChats') || '[]');
                resolved = (adminChats || []).find(c => c && c.id && (c.id === chatId || String(c.id).indexOf(String(chatId)) !== -1));
                if (!resolved) {
                    const chats = JSON.parse(localStorage.getItem('chatNotifications') || '[]');
                    resolved = (chats || []).find(c => c && c.id && (c.id === chatId || String(c.id).indexOf(String(chatId)) !== -1));
                }
                if (resolved && resolved.id && resolved.id !== chatId) {
                    console.log('openAdminChat: resolved partial id', chatId, '->', resolved.id);
                    return openAdminChat(resolved.id);
                }
                // Try scanning all localStorage keys for messages that include the chatId
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    if (String(key).indexOf(chatId) !== -1) {
                        try {
                            const data = JSON.parse(localStorage.getItem(key) || 'null');
                            if (Array.isArray(data) && data.length) {
                                console.log('openAdminChat: found messages under storage key', key);
                                messages = data.slice();
                                break;
                            }
                        } catch(e) {}
                    }
                }
            } catch(e){ console.warn('openAdminChat: resolution attempt failed', e); }

            // If no chat metadata found, create a minimal chat object so the conversation view opens
            if (!chat) {
                chat = resolved || { id: chatId };
                // prefer participantName from resolved metadata
                if (!chat.userName && (chat.participantName || chat.userName || chat.user_email || chat.userName)) {
                    chat.userName = chat.participantName || chat.userName || chat.user_email || chat.userName;
                }
                // fallback: prettify id into a label
                if (!chat.userName) {
                    try {
                        const pretty = String(chatId).replace(/^property-\d+-/,'').replace(/[-_]/g,' ');
                        chat.userName = pretty || chatId;
                    } catch(e){ chat.userName = chatId; }
                }
                console.log('openAdminChat: opening minimal chat view for', chatId, 'title=', chat.userName);
            }
        }
    }
    document.getElementById('chat-fullview').style.display = 'block';
    document.getElementById('admin-chats-list').style.display = 'none';
    // hide the chat list actions (search + refresh) while viewing a conversation
    try{ const actions = document.getElementById('chatActions'); if(actions) actions.style.display = 'none'; }catch(e){}
    document.getElementById('chat-full-title').textContent = chat.userName || chat.conversationTitle || chat.participantName || chat.participantId;
    document.getElementById('chat-full-sub').textContent = chat.conversationTitle || chat.participantId || '';
    try{ document.getElementById('chat-full-title').dataset.chatId = chatId; }catch(e){}
    // Render messages (include property card at top if available)
    const msgsEl = document.getElementById('chat-full-messages');
    // Determine propertyCard: prefer explicit conversationProperty, then API-provided property,
    // then search all messages for the first meta.property occurrence as a robust fallback.
    let propertyCard = null;
    try{
        if (chat && chat.conversationProperty) propertyCard = chat.conversationProperty;
        if (!propertyCard && messages && messages.length) {
            // check if first message or any message contains property meta
            for (let mi = 0; mi < messages.length; mi++){
                const mm = messages[mi];
                if (mm && mm.meta && mm.meta.property){ propertyCard = mm.meta.property; break; }
            }
        }
        // also honor conversation-level property if present
        if (!propertyCard && chat && chat.conversationProperty) propertyCard = chat.conversationProperty;
        // persist back onto chat so later re-renders keep using it
        if (chat && propertyCard) chat.conversationProperty = propertyCard;
    }catch(e){ propertyCard = null }
    if (!messages.length && !propertyCard) {
        msgsEl.innerHTML = '<div style="padding:12px;color:var(--text-light);">No messages yet.</div>';
    } else {
        // If a property exists, render a preview card before the messages container (match user conversation page)
        try {
            // remove any existing card
            const existingCard = document.getElementById('messages-property-card');
            if (existingCard && existingCard.parentNode) existingCard.parentNode.removeChild(existingCard);
            if (propertyCard) {
                const p = propertyCard;
                const img = p.image || (p.images && p.images[0]) || '';
                const imgSrc = img ? normalizeImageUrl(img) : '';
                const title = p.title || p.name || 'Property';
                const price = (p.price != null) ? (`€${Number(p.price).toLocaleString()}`) : '';
                const loc = p.location || p.address || '';
                const propId = p.id || p.propertyId || p.property_id || '';
                // If we're on the admin page, render the richer property bubble (badge, beds, baths, type)
                const isAdminPage = (typeof window !== 'undefined' && window.location && window.location.pathname && window.location.pathname.indexOf('admin') !== -1);
                if (isAdminPage) {
                    const badge = p.hot ? '🔥 Hot Property' : (p.featured ? '⭐ Featured Property' : '✅ Available Property');
                    const beds = p.bedrooms || p.beds || p.bed || 0;
                    const baths = p.bathrooms || p.baths || p.bath || 0;
                    const typeLabel = (p.type === 'rent' || String(p.post_to||'').toLowerCase()==='rent') ? 'For Rent' : 'For Sale';
                    const html = `
                        <a href="property-detail.html?id=${escapeHtml(String(propId))}&conversation=true" style="text-decoration:none;color:inherit;display:block">
                        <div id="messages-property-card" style="padding:12px;border-radius:8px;background:#f7fafd;margin-bottom:10px;display:flex;gap:18px;align-items:center;border:1px solid var(--border);max-width:900px;">
                            <div style="width:110px;height:80px;flex:0 0 110px;">
                                ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(title)}" style="width:110px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:#f7f7f7;">` : `<div style="width:110px;height:80px;border-radius:8px;background:#f7f7f7;border:1px solid var(--border);"></div>`}
                            </div>
                            <div style="flex:1;min-width:0">
                                <div style="font-weight:700;font-size:17px;line-height:1.2;">${escapeHtml(title)}</div>
                                <div style="display:flex;align-items:center;gap:10px;color:var(--secondary);font-size:14px;margin:2px 0 6px 0;">
                                    <span>${escapeHtml(loc)}</span>
                                    <span style='background:#3498db;color:#fff;font-size:12px;padding:2px 8px;border-radius:6px;'>${escapeHtml(badge)}</span>
                                </div>
                                <div style="display:flex;gap:16px;font-size:14px;color:#444;align-items:center;">
                                    <span>${escapeHtml(price)}</span>
                                    <span>${escapeHtml(String(beds))} bed</span>
                                    <span>${escapeHtml(String(baths))} bath</span>
                                    <span style="background:#eaf6ff;color:#3498db;padding:2px 8px;border-radius:6px;font-size:13px;">${escapeHtml(typeLabel)}</span>
                                </div>
                            </div>
                        </div>
                        </a>
                    `;
                    const temp = document.createElement('div'); temp.innerHTML = html;
                    const node = temp.firstElementChild;
                    if (msgsEl && msgsEl.parentNode) msgsEl.parentNode.insertBefore(node, msgsEl);
                } else {
                    // simple card for user pages
                    const cardWrap = document.createElement('div');
                    cardWrap.id = 'messages-property-card';
                    cardWrap.style.padding = '12px';
                    cardWrap.style.borderRadius = '8px';
                    cardWrap.style.background = '#f8fafc';
                    cardWrap.style.margin = '6px 0 12px 0';
                    cardWrap.style.display = 'flex';
                    cardWrap.style.gap = '12px';
                    cardWrap.style.alignItems = 'center';
                    cardWrap.style.cursor = 'pointer';
                    if (imgSrc) {
                        const im = document.createElement('img');
                        im.src = imgSrc;
                        im.alt = title;
                        im.style.cssText = 'width:84px;height:64px;object-fit:cover;border-radius:6px;';
                        cardWrap.appendChild(im);
                    } else {
                        const placeholder = document.createElement('div');
                        placeholder.style.cssText = 'width:84px;height:64px;border-radius:6px;background:#f5f7fa;border:1px solid #f1f5fb';
                        cardWrap.appendChild(placeholder);
                    }
                    const info = document.createElement('div'); info.style.flex = '1';
                    const t = document.createElement('div'); t.style.fontWeight = '700'; t.style.marginBottom = '4px'; t.textContent = title;
                    const s = document.createElement('div'); s.style.color = '#666'; s.style.fontSize = '13px'; s.textContent = (loc || '') + (price ? (' — ' + price) : '');
                    info.appendChild(t); info.appendChild(s); cardWrap.appendChild(info);
                    if (propId) cardWrap.addEventListener('click', function(){ window.location.href = 'property-detail.html?id='+encodeURIComponent(propId)+'&conversation=true'; });
                    if (msgsEl && msgsEl.parentNode) msgsEl.parentNode.insertBefore(cardWrap, msgsEl);
                }
                // prevent duplicate property meta in first message rendering
                try { if (messages[0] && messages[0].meta && messages[0].meta.property) delete messages[0].meta.property; } catch(e){}
            }
        } catch(e) { console.warn('Failed to render property card in admin chat fullview', e); }

        const htmlParts = messages.map(m => {
            const isAdmin = (m.sender === 'admin' || m.from === 'Admin');
            const senderLabel = isAdmin ? 'Admin' : (m.userName || m.userEmail || m.sender || m.from || 'User');
            const ts = new Date(m.timestamp || m.ts || m.time || Date.now()).toLocaleString();

            // If this message contains a property payload, render a property preview inside the bubble
            let bodyHtml = '';
            try {
                const prop = (m && (m.meta && m.meta.property)) ? m.meta.property : (m && m.property ? m.property : null);
                if (prop) {
                    const p = prop;
                    const img = p.image || (p.images && p.images[0]) || '';
                    const imgSrc = img ? normalizeImageUrl(img) : '';
                    const title = p.title || p.name || 'Property';
                    const price = (p.price != null) ? (`€${Number(p.price).toLocaleString()}`) : '';
                    const loc = p.location || p.address || '';
                    const propId = p.id || p.propertyId || p.property_id || '';
                    const link = 'property-detail.html?id=' + encodeURIComponent(propId) + '&conversation=true';
                    bodyHtml = `
                        <a href="${escapeHtml(link)}" style="text-decoration:none;color:inherit;display:block">
                            <div style="display:flex;gap:8px;align-items:center;">
                                <div style="width:84px;height:64px;flex:0 0 84px;">
                                    ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(title)}" style="width:84px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">` : `<div style="width:84px;height:64px;border-radius:6px;background:#f5f7fa;border:1px solid #f1f5fb"></div>`}
                                </div>
                                <div style="flex:1;min-width:0">
                                    <div style="font-weight:700;font-size:14px;line-height:1.2;">${escapeHtml(title)}</div>
                                    <div style="color:#666;font-size:13px;margin-top:4px">${escapeHtml((price ? price + ' — ' : '') + loc)}</div>
                                </div>
                            </div>
                        </a>
                    `;
                } else {
                    bodyHtml = `<div style="white-space:pre-wrap">${escapeHtml(String(m.text || m.body || m.content || ''))}</div>`;
                }
            } catch(e) {
                bodyHtml = `<div style="white-space:pre-wrap">${escapeHtml(String(m.text || m.body || m.content || ''))}</div>`;
            }

            return `
            <div style="display:flex;${isAdmin ? 'justify-content:flex-end' : 'justify-content:flex-start'};margin-bottom:8px;">
                <div style="max-width:75%;background:${isAdmin ? '#3498db' : '#fff'};color:${isAdmin ? '#fff' : '#222'};padding:10px;border-radius:10px;box-shadow:var(--shadow);">
                    <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:${isAdmin ? '#fff' : '#666'};">${escapeHtml(senderLabel)}</div>
                    ${bodyHtml}
                    <div style="font-size:11px;color:rgba(0,0,0,0.45);margin-top:6px;text-align:${isAdmin ? 'right' : 'left'};">${escapeHtml(ts)}</div>
                </div>
            </div>
            `;
        });

        msgsEl.innerHTML = htmlParts.join('');
    }
    document.getElementById('chat-full-input').disabled = false;
}

function backToChatList() {
    document.getElementById('chat-fullview').style.display = 'none';
    document.getElementById('admin-chats-list').style.display = 'block';
    // restore chat action bar
    try{ const actions = document.getElementById('chatActions'); if(actions) actions.style.display = ''; }catch(e){}
}

// Render chat list when switching to chat tab
document.addEventListener('DOMContentLoaded', function() {
    const chatTab = document.getElementById('chat');
    if (chatTab && typeof renderAdminChatList === 'function') {
        // If admin widget exists, let it initialize and load conversations instead of legacy renderer
        if (window._adminChatWidget && typeof window._adminChatWidget.loadConversations === 'function') {
            try { window._adminChatWidget.loadConversations(); }
            catch(e){ console.warn('admin widget load failed', e); renderAdminChatList(); }
        } else {
            renderAdminChatList();
        }
    }
});


// Only declare these variables if not already declared (avoid redeclaration error)
if (typeof mobileSupportBtn === 'undefined') {
    var mobileSupportBtn = document.getElementById('mobile-support-btn');
    var mobileLikesBtn = document.getElementById('mobile-likes-btn');
    var mobileWalletBtn = document.getElementById('mobile-wallet-btn');
    var mobileNotificationBtn = document.getElementById('mobile-notification-btn');
    var mobileChatBtn = document.getElementById('mobile-chat-btn');
}

if (mobileSupportBtn) {
    mobileSupportBtn.addEventListener('click', function() {
        window.location.href = 'contact.html';
    });
}

if (mobileLikesBtn) {
    mobileLikesBtn.addEventListener('click', function() {
        window.location.href = 'likes.html';
    });
}

if (mobileWalletBtn) {
    mobileWalletBtn.addEventListener('click', function() {
        window.location.href = 'wallet.html';
    });
}

if (mobileNotificationBtn) {
    mobileNotificationBtn.addEventListener('click', function() {
        window.location.href = 'notifications.html';
    });
}

if (mobileChatBtn) {
    mobileChatBtn.addEventListener('click', function() {
        window.location.href = 'chat.html';
    });
}

// Unread badges: inject/update unread-count badges in header, hamburger and admin sidebar
function upsertBadge(hostEl, id, count, opts = {}){
    if(!hostEl) return;
    let badge = hostEl.querySelector('.nav-badge[data-badge-id="' + id + '"]');
    if(!badge && count <= 0) return;
    if(badge && count <= 0){ badge.remove(); return; }
    if(!badge){
        badge = document.createElement('span');
        badge.className = 'nav-badge' + (opts.small ? ' small' : '') + (opts.inline ? ' inline' : '') + (opts.cls ? ' ' + opts.cls : '');
        badge.setAttribute('data-badge-id', id);
        // append badge appropriately: for inline anchors prefer append, for buttons append
        hostEl.appendChild(badge);
    }
    badge.textContent = String(count);
}

async function updateNavUnreadCounts(){
    try{
        let userId = null;
        try{
            const wispaUserRaw = localStorage.getItem('wispaUser');
            if(wispaUserRaw){ try{ userId = JSON.parse(wispaUserRaw).id; }catch(e){} }
        }catch(e){}
        // If localStorage is disabled (DB-only mode) or empty, ask server for current user via /api/me
        if(!userId){
            try{
                const r = window.apiFetch ? await window.apiFetch('/api/me') : await fetch('/api/me');
                if(r && r.ok){ const j = await r.json(); if(j && j.user) userId = j.user.id; }
            }catch(e){}
        }

        // user notifications (prefer server-backed endpoints)
        let notifCount = 0;
        let chatCount = 0;
        if (userId) {
            try {
                const nr = window.apiFetch ? await window.apiFetch('/api/notifications?userId=' + encodeURIComponent(userId)) : await fetch('/api/notifications?userId=' + encodeURIComponent(userId));
                if (nr && nr.ok) {
                    const nj = await nr.json();
                    const notes = nj.notifications || nj || [];
                    notifCount = Array.isArray(notes) ? notes.filter(n => !n.read).length : 0;
                } else {
                    const notes = JSON.parse(localStorage.getItem('notifications_' + userId) || '[]');
                    notifCount = notes.filter(n => !n.read).length;
                }
            } catch (e) {
                try { const notes = JSON.parse(localStorage.getItem('notifications_' + userId) || '[]'); notifCount = notes.filter(n => !n.read).length; } catch(e){}
            }

            try {
                const cr = window.apiFetch ? await window.apiFetch('/api/conversations?userId=' + encodeURIComponent(userId)) : await fetch('/api/conversations?userId=' + encodeURIComponent(userId));
                if (cr && cr.ok) {
                    const cj = await cr.json();
                    const convs = cj.conversations || cj || [];
                    if (Array.isArray(convs)) chatCount = convs.reduce((s,c) => s + (Number(c.unread) || 0), 0);
                } else {
                    const convs = JSON.parse(localStorage.getItem('conversations_' + userId) || '[]');
                    chatCount = convs.reduce((s,c) => s + (Number(c.unread) || 0), 0);
                }
            } catch (e) {
                try { const convs = JSON.parse(localStorage.getItem('conversations_' + userId) || '[]'); chatCount = convs.reduce((s,c) => s + (Number(c.unread) || 0), 0); } catch(e){}
            }
        }

        // header notification button
        const notifBtn = document.querySelector('.notification-btn');
        if(notifBtn) upsertBadge(notifBtn, 'header-notif', notifCount, { small: true });

        // hamburger dropdown entries
        const hamburger = document.getElementById('hamburgerMenuContainer');
        if(hamburger){
            const notifLink = hamburger.querySelector('a[href="notifications.html"]');
            if(notifLink) upsertBadge(notifLink, 'hamburger-notif', notifCount, { small: true, inline: true });
            const chatBtn = hamburger.querySelector('.chat-btn');
            if(chatBtn) upsertBadge(chatBtn, 'hamburger-chat', chatCount, { small: true, inline: true });
        }

        // Admin counts (global storage keys) - include post-like reactions
        const _wispaNotifs = JSON.parse(localStorage.getItem('wispaNotifications') || '[]');
        const _reactions = JSON.parse(localStorage.getItem('notificationReactions') || '[]');
        const adminAlertCount = _wispaNotifs.filter(n => !n.read).length + _reactions.filter(r => !r.read).length;
        // Prefer server-side conversation unread counts for admin badge; fallback to localStorage
        let adminChatCount = 0;
        try {
            // Prefer server-side conversation unread counts for admin badge; fallback to localStorage
            try {
                const convRes = window.apiFetch ? await window.apiFetch('/api/conversations') : await fetch('/api/conversations');
                if (convRes && convRes.ok) {
                    const cj = await convRes.json();
                    const convsAll = cj.conversations || cj || [];
                    if (Array.isArray(convsAll)) adminChatCount = convsAll.reduce((s, c) => s + (Number(c.unread) || 0), 0);
                    else adminChatCount = 0;
                } else {
                    const convs = JSON.parse(localStorage.getItem('chatNotifications') || '[]');
                    adminChatCount = convs.filter(n => !n.read).length;
                }
            } catch (e) {
                try { const convs = JSON.parse(localStorage.getItem('chatNotifications') || '[]'); adminChatCount = convs.filter(n => !n.read).length; } catch(e) { adminChatCount = 0; }
            }
        } catch (e) {
            try { const convs = JSON.parse(localStorage.getItem('chatNotifications') || '[]'); adminChatCount = convs.filter(n => !n.read).length; } catch(e) { adminChatCount = 0; }
        }

        const adminAlertsLink = document.querySelector('a[href="#alerts"]');
        if(adminAlertsLink) upsertBadge(adminAlertsLink, 'admin-alerts', adminAlertCount, { small: true, inline: true, cls: 'sidebar-badge' });
        const adminChatLink = document.querySelector('a[href="#chat"]');
        if(adminChatLink) upsertBadge(adminChatLink, 'admin-chat', adminChatCount, { small: true, inline: true, cls: 'sidebar-badge' });

        // update admin stat elements if present
        const statAlertUnread = document.getElementById('alert-unread');
        if(statAlertUnread) statAlertUnread.textContent = String(adminAlertCount);
        const statMessagesUnread = document.getElementById('stat-messages-unread');
        if(statMessagesUnread){
            if(adminChatCount === 0){ statMessagesUnread.textContent = 'All read'; statMessagesUnread.style.color = '#2ecc71'; }
            else { statMessagesUnread.textContent = `${adminChatCount} unread`; statMessagesUnread.style.color = '#e74c3c'; }
        }
    }catch(err){
        console.error('updateNavUnreadCounts error', err);
    }
}

document.addEventListener('DOMContentLoaded', updateNavUnreadCounts);
window.addEventListener('storage', function(e){
    if(!e.key){ updateNavUnreadCounts(); return; }
    const watched = ['notifications_', 'conversations_', 'wispaNotifications', 'chatNotifications', 'adminSentNotifications', 'pendingUserNotifications', 'pendingUserConversations', 'wispaMessageSignal_', 'notifications_signal_', 'notificationReactions'];
    if(watched.some(k => e.key === k || e.key.startsWith(k))) updateNavUnreadCounts();
});

// Process pending notifications/conversations created by admin when the user logs in
function processPendingForCurrentUser(){
    try{
        const wispaUserRaw = localStorage.getItem('wispaUser');
        if(!wispaUserRaw) return;
        const userId = JSON.parse(wispaUserRaw).id;
        if(!userId) return;

        // Move pending notifications
        const pending = JSON.parse(localStorage.getItem('pendingUserNotifications') || '{}');
        if(pending[userId] && Array.isArray(pending[userId]) && pending[userId].length){
            const userNotifsKey = 'notifications_' + userId;
            const existing = JSON.parse(localStorage.getItem(userNotifsKey) || '[]');
            const toMove = pending[userId];
            // Mark as unread (read=false) when moving
            toMove.forEach(n => { n.read = !!n.read; existing.push(n); });
            localStorage.setItem(userNotifsKey, JSON.stringify(existing));
            // remove moved
            delete pending[userId];
            localStorage.setItem('pendingUserNotifications', JSON.stringify(pending));
        }

        // Move pending conversations
        const pendingConvs = JSON.parse(localStorage.getItem('pendingUserConversations') || '{}');
        if(pendingConvs[userId] && Array.isArray(pendingConvs[userId]) && pendingConvs[userId].length){
            const convsKey = 'conversations_' + userId;
            const convs = JSON.parse(localStorage.getItem(convsKey) || '[]');
            const userPending = pendingConvs[userId];
            userPending.forEach(pc => {
                // add or merge
                const existing = convs.find(c => c.id === pc.id);
                if(existing){
                    existing.last = pc.last || existing.last;
                    existing.updated = pc.updated || existing.updated;
                    existing.unread = (existing.unread || 0) + (pc.unread || 0);
                } else {
                    convs.unshift({ id: pc.id, agent: pc.agent || 'Administrator', last: pc.last || '', unread: pc.unread || 1, updated: pc.updated || Date.now() });
                }

                // save messages for conversation
                try{
                    const convKey = 'wispaMessages_' + userId + '_' + pc.id;
                    const existingMsgs = JSON.parse(localStorage.getItem(convKey) || '[]');
                    const msgs = Array.isArray(pc.messages) ? pc.messages : [];
                    const merged = existingMsgs.concat(msgs);
                    localStorage.setItem(convKey, JSON.stringify(merged));
                }catch(e){console.error(e)}
            });
            localStorage.setItem(convsKey, JSON.stringify(convs));

            // remove moved
            delete pendingConvs[userId];
            localStorage.setItem('pendingUserConversations', JSON.stringify(pendingConvs));
        }

        // Refresh badges and signals
        try{ updateNavUnreadCounts(); } catch(e){}
        try{ localStorage.setItem('wispaMessageSignal_' + userId, String(Date.now())); } catch(e){}
    }catch(e){ console.error('processPendingForCurrentUser error', e); }
}

// Run processing on load so users receive admin messages created while they were offline
document.addEventListener('DOMContentLoaded', processPendingForCurrentUser);

// Poll unread counts periodically so the header badge stays up-to-date
try{ window._navPoll = setInterval(()=>{ try{ updateNavUnreadCounts(); }catch(e){} }, 30000); }catch(e){}

// ==================================================
// PROPERTY DATA & GENERATION
// ==================================================

// Array of working Unsplash photo IDs for property images
if (typeof propertyImageIds === 'undefined') {
	var propertyImageIds = [
		'1506905925456-403c2fe79591', // Modern house
		'1512917774080-9991f1c4c750', // Luxury home
		'1564013799919-ab600027ffc6', // Beautiful house
		'1570129477497-45c003edd2be', // Modern architecture
		'1449844908441-8829872d2607', // House exterior
		'1484154218962-a197022b5858', // Residential area
		'1502672260266-1c1ef2d93688', // Modern home
		'1439066615861-d1af74d74000', // House with garden
		'1475855581690-80accde3ae2b', // Luxury property
		'1502672260266-1c1ef2d93688', // Contemporary home
		'1512917774080-9991f1c4c750', // Urban property
		'1558618666-fcd25c85cd64', // Modern apartment
		'1570129477492-45c003edd2be', // Family home
		'1502672260266-1c1ef2d93688', // Spacious living
		'1560518099-ce2b3eac8db9', // Garden view
		'1512917774080-9991f1c4c750', // Cozy apartment
		'1506905925456-403c2fe79591', // Dream house
		'1445083114551-6e7b4b7e3c89', // Luxury living
		'1514432324607-a09d9fa4aeffa', // Modern design
		'1470071459604-3b5ec3a7fe75', // Spacious home
		'1464207687429-7505649dae38', // Beach property
		'1556909114-f6e7ad7d3136', // City apartment
		'1484299724270-9c6fef0d6d81', // Elegant home
		'1516594547529-c61b6bca042c', // Villa
		'1502672260266-1c1ef2d93688', // Modern property
		'1520763185298-1b434c919afe', // Suburban home
		'1507003211169-0a1dd7228f2d', // Luxury estate
		'1514432324607-a09d9fa4aeffa', // Contemporary design
		'1502672260266-1c1ef2d93688', // Residential property
		'1570129477492-45c003edd2be'  // Family residence
	];
}

    // Function to get a random property image URL
    function getRandomPropertyImage() {
        const randomId = propertyImageIds[Math.floor(Math.random() * propertyImageIds.length)];
        return `https://images.unsplash.com/${randomId}?w=400&h=300&fit=crop&auto=format`;
    }

    // Function to generate multiple images for a property (1-4 images)
    function getRandomPropertyImages() {
        const numImages = Math.floor(Math.random() * 4) + 1; // 1 to 4 images
        const images = [];
        for (let i = 0; i < numImages; i++) {
            images.push(getRandomPropertyImage());
        }
        return images;
    }

    // ...existing code...

    // Mobile Post Ad button removed (element not in current admin panel)
    // Mobile Chat button removed (element not in current admin panel)
    // Mobile Notification button removed (element not in current admin panel)
    // Mobile Wallet button removed (element not in current admin panel)

    if (typeof propertyList === 'undefined') {
        var propertyList = null;
    }
    var searchInput = null;
    const searchBtn = document.getElementById('search-btn');
    const categoryLinks = document.querySelectorAll('nav ul li a');
    // const applyFiltersBtn = document.getElementById('apply-filters');

    // Generate comprehensive property data for all countries
    const countries = [
        'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
        'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
        'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
        'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
        'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
        'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon',
        'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
        'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica',
        'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho',
        'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali',
        'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro',
        'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
        'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea',
        'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis',
        'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia',
        'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea',
        'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan',
        'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
        'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City',
        'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
    ];

    // Property templates for different types
    const propertyTemplates = {
        land: [
            { title: 'Prime land plot', area: [500, 2000], priceRange: [50000, 500000] },
            { title: 'Commercial land', area: [1000, 5000], priceRange: [100000, 1000000] },
            { title: 'Residential land', area: [300, 1500], priceRange: [30000, 300000] },
            { title: 'Agricultural land', area: [2000, 10000], priceRange: [20000, 200000] },
            { title: 'Investment land', area: [800, 3000], priceRange: [80000, 800000] },
            { title: 'Development land', area: [1500, 8000], priceRange: [150000, 1500000] },
            { title: 'Beachfront land', area: [600, 2500], priceRange: [100000, 2000000] },
            { title: 'Mountain land', area: [1000, 4000], priceRange: [40000, 400000] },
            { title: 'Urban land', area: [200, 800], priceRange: [150000, 1500000] },
            { title: 'Industrial land', area: [3000, 15000], priceRange: [200000, 2000000] }
        ],
        house: [
            { title: 'Modern villa', bedrooms: [3, 6], bathrooms: [2, 4], area: [200, 500], priceRange: [200000, 2000000] },
            { title: 'Detached house', bedrooms: [2, 5], bathrooms: [1, 3], area: [120, 350], priceRange: [150000, 800000] },
            { title: 'Townhouse', bedrooms: [2, 4], bathrooms: [1, 3], area: [80, 200], priceRange: [100000, 500000] },
            { title: 'Apartment', bedrooms: [1, 3], bathrooms: [1, 2], area: [50, 150], priceRange: [80000, 400000] },
            { title: 'Penthouse', bedrooms: [2, 4], bathrooms: [2, 3], area: [100, 250], priceRange: [300000, 1500000] },
            { title: 'Bungalow', bedrooms: [2, 4], bathrooms: [1, 2], area: [90, 180], priceRange: [120000, 600000] },
            { title: 'Cottage', bedrooms: [1, 3], bathrooms: [1, 2], area: [60, 140], priceRange: [90000, 350000] },
            { title: 'Mansion', bedrooms: [5, 10], bathrooms: [4, 8], area: [400, 1000], priceRange: [1000000, 5000000] },
            { title: 'Condo', bedrooms: [1, 2], bathrooms: [1, 2], area: [40, 100], priceRange: [70000, 300000] },
            { title: 'Duplex', bedrooms: [3, 6], bathrooms: [2, 4], area: [150, 300], priceRange: [180000, 900000] }
        ],
        rent: [
            { title: 'Luxury apartment', bedrooms: [1, 4], bathrooms: [1, 3], area: [60, 200], priceRange: [800, 5000] },
            { title: 'Studio apartment', bedrooms: [0, 0], bathrooms: [1, 1], area: [25, 50], priceRange: [400, 1200] },
            { title: 'Family house', bedrooms: [3, 6], bathrooms: [2, 4], area: [150, 400], priceRange: [1500, 8000] },
            { title: 'Room for rent', bedrooms: [1, 1], bathrooms: [1, 1], area: [15, 30], priceRange: [200, 600] },
            { title: 'Villa rental', bedrooms: [4, 8], bathrooms: [3, 6], area: [250, 600], priceRange: [3000, 15000] },
            { title: 'Office space', bedrooms: [0, 0], bathrooms: [1, 2], area: [50, 200], priceRange: [1000, 5000] },
            { title: 'Commercial space', bedrooms: [0, 0], bathrooms: [1, 2], area: [100, 500], priceRange: [2000, 10000] },
            { title: 'Penthouse rental', bedrooms: [2, 4], bathrooms: [2, 3], area: [120, 300], priceRange: [2500, 10000] },
            { title: 'Townhouse rental', bedrooms: [2, 4], bathrooms: [1, 3], area: [100, 250], priceRange: [1200, 6000] },
            { title: 'Cottage rental', bedrooms: [1, 3], bathrooms: [1, 2], area: [70, 150], priceRange: [600, 2500] }
        ]
    };

    // Generate properties for all countries
    function generateProperties() {
        const properties = [];
        let idCounter = 1;
        const dates = ['Today', 'Yesterday', '1 hour ago', '2 hours ago', '3 hours ago', '5 hours ago', '1 day ago', '2 days ago', '3 days ago', '4 days ago', '5 days ago', '6 days ago', '1 week ago', '2 weeks ago'];

        countries.forEach(country => {
            // Generate 10 land properties per country
            propertyTemplates.land.forEach((template, index) => {
                const area = Math.floor(Math.random() * (template.area[1] - template.area[0] + 1)) + template.area[0];
                const price = Math.floor(Math.random() * (template.priceRange[1] - template.priceRange[0] + 1)) + template.priceRange[0];
                properties.push({
                    id: String(idCounter++).padStart(8, '0'),
                    title: `${template.title} for sale`,
                    price: price,
                    type: 'sale',
                    bedrooms: 0,
                    bathrooms: 0,
                    area: area,
                    location: `${country}, City Center`,
                    images: getRandomPropertyImages(),
                    featured: Math.random() < 0.1, // 10% chance to be featured
                    date: dates[Math.floor(Math.random() * dates.length)]
                });
            });

            // Generate 10 house properties per country
            propertyTemplates.house.forEach((template, index) => {
                const bedrooms = Math.floor(Math.random() * (template.bedrooms[1] - template.bedrooms[0] + 1)) + template.bedrooms[0];
                const bathrooms = Math.floor(Math.random() * (template.bathrooms[1] - template.bathrooms[0] + 1)) + template.bathrooms[0];
                const area = Math.floor(Math.random() * (template.area[1] - template.area[0] + 1)) + template.area[0];
                const price = Math.floor(Math.random() * (template.priceRange[1] - template.priceRange[0] + 1)) + template.priceRange[0];
                properties.push({
                    id: String(idCounter++).padStart(8, '0'),
                    title: `${bedrooms}-bedroom ${template.title} for sale`,
                    price: price,
                    type: 'sale',
                    bedrooms: bedrooms,
                    bathrooms: bathrooms,
                    area: area,
                    location: `${country}, Residential Area`,
                    images: getRandomPropertyImages(),
                    featured: Math.random() < 0.1, // 10% chance to be featured
                    date: dates[Math.floor(Math.random() * dates.length)]
                });
            });

            // Generate 10 rent properties per country
            propertyTemplates.rent.forEach((template, index) => {
                const bedrooms = template.bedrooms ? Math.floor(Math.random() * (template.bedrooms[1] - template.bedrooms[0] + 1)) + template.bedrooms[0] : 0;
                const bathrooms = Math.floor(Math.random() * (template.bathrooms[1] - template.bathrooms[0] + 1)) + template.bathrooms[0];
                const area = Math.floor(Math.random() * (template.area[1] - template.area[0] + 1)) + template.area[0];
                const price = Math.floor(Math.random() * (template.priceRange[1] - template.priceRange[0] + 1)) + template.priceRange[0];
                properties.push({
                    id: String(idCounter++).padStart(8, '0'),
                    title: `${bedrooms > 0 ? bedrooms + '-bedroom ' : ''}${template.title} to rent`,
                    price: price,
                    type: 'rent',
                    bedrooms: bedrooms,
                    bathrooms: bathrooms,
                    area: area,
                    location: `${country}, Downtown`,
                    images: getRandomPropertyImages(),
                    featured: Math.random() < 0.1, // 10% chance to be featured
                    date: dates[Math.floor(Math.random() * dates.length)]
                });
            });
        });

        return properties;
    }

    // Start with no system-generated properties. Homepage will show only admin-saved posts.
    // Use `var` so early-initialization callers (initialized above) do not hit TDZ.
    var properties = [];

    // Initialize user-specific liked properties (async; uses server-backed session if available)
    async function initializeLikedProperties() {
        try {
            const user = await (window.getCurrentUser ? window.getCurrentUser() : null);
            if (!user || !user.id) return;
            const userId = user.id;
            const likedProperties = JSON.parse(localStorage.getItem('likedProperties_' + userId) || '[]');
            // Only initialize demo liked properties if there are existing properties
            if (likedProperties.length === 0 && properties.length > 0) {
                const likedIds = [];
                const count = Math.min(50, properties.length);
                for (let i = 0; i < count; i++) {
                    const randomIndex = Math.floor(Math.random() * properties.length);
                    const randomId = properties[randomIndex].id;
                    if (randomId && !likedIds.includes(randomId)) {
                        likedIds.push(randomId);
                    }
                }
                if (likedIds.length) localStorage.setItem('likedProperties_' + userId, JSON.stringify(likedIds));
            }
        } catch (e) { /* ignore */ }
    }

    // fire-and-forget initialization
    initializeLikedProperties().catch(()=>{});

    // Wire up any existing like buttons on the page (static or dynamically added)
    async function initializeGlobalLikeButtons() {
        try{
            const user = await (window.getCurrentUser ? window.getCurrentUser() : null);
            if (!user || !user.id) return;
            const userId = user.id;
            const selector = '.similar-property-like-btn, .like-btn';
            document.querySelectorAll(selector).forEach(btn => {
            // avoid double-binding
            if (btn.dataset._likeInit) return;
            btn.dataset._likeInit = '1';
            btn.addEventListener('click', async function(e) {
                e.preventDefault();
                e.stopPropagation();
                const btnEl = e.currentTarget;
                const id = btnEl.dataset.id || btnEl.dataset.propertyId || btnEl.getAttribute('data-id') || btnEl.getAttribute('data-property-id');
                if (!id) return;
                // user validated at init; reuse outer `user` and `userId`
                const liked = JSON.parse(localStorage.getItem('likedProperties_' + userId) || '[]');
                const idx = liked.findIndex(x => String(x) === String(id));
                if (idx > -1) {
                    liked.splice(idx, 1);
                    btnEl.classList.remove('liked');
                    btnEl.textContent = '♡';

                    // remove existing like reaction for this user/post
                    try {
                        let reactions = JSON.parse(localStorage.getItem('notificationReactions') || '[]');
                        reactions = reactions.filter(r => !(String(r.postId) === String(id) && String(r.userId) === String(userId) && r.reaction === 'like'));
                        localStorage.setItem('notificationReactions', JSON.stringify(reactions));
                    } catch(e) { console.error(e); }
                } else {
                    liked.push(String(id));
                    btnEl.classList.add('liked');
                    btnEl.textContent = '♥';

                    // create a notification reaction for admin to see this like
                    try {
                        const reactions = JSON.parse(localStorage.getItem('notificationReactions') || '[]');
                        const prop = (typeof properties !== 'undefined' && Array.isArray(properties)) ? properties.find(p => String(p.id) === String(id)) : null;
                        const reactionObj = {
                            id: 'react-' + Date.now() + '-' + Math.random().toString(36).slice(2,8),
                            userId: userId,
                            userName: (user && (user.username || user.email)) || userId,
                            postId: id,
                            postTitle: prop ? (prop.title || prop.location || 'Property') : 'Post',
                            timestamp: new Date().toISOString(),
                            date: new Date().toISOString(),
                            read: false,
                            reaction: 'like',
                            notificationTitle: `Like on ${prop ? (prop.title || 'your post') : 'your post'}`
                        };
                        // Try to persist reaction to server, fallback to localStorage
                        (async function(){
                            try {
                                await fetch('/api/notification-reactions', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(reactionObj)
                                });
                                // also update local copy for UI
                                reactions.unshift(reactionObj);
                                localStorage.setItem('notificationReactions', JSON.stringify(reactions));
                                try { localStorage.setItem('notificationReactions_signal', String(Date.now())); } catch(e){}
                            } catch (e) {
                                reactions.unshift(reactionObj);
                                localStorage.setItem('notificationReactions', JSON.stringify(reactions));
                                try { localStorage.setItem('notificationReactions_signal', String(Date.now())); } catch(e){}
                            }
                        })();
                    } catch(e) { console.error('error saving reaction', e); }
                }
                localStorage.setItem('likedProperties_' + userId, JSON.stringify(liked));
            });
        });

        // initialize state from storage
        const likedInit = JSON.parse(localStorage.getItem('likedProperties_' + userId) || '[]');
        document.querySelectorAll(selector).forEach(btn => {
            const id = btn.dataset.id || btn.dataset.propertyId || btn.getAttribute('data-id') || btn.getAttribute('data-property-id');
            if (!id) return;
            if (likedInit.find(x => String(x) === String(id))) {
                btn.classList.add('liked');
                btn.textContent = '♥';
            }
        });
    } catch (e) { /* ignore */ }

    // End try/catch for initialization
    }

    // Start empty — will be populated after `properties` is loaded from the API
    let filteredProperties = [];
    let currentCategory = 'all';
    let displayedProperties = [];
    let currentPage = 1;
    const propertiesPerPage = 20;

    function renderProperties(props, append = false) {
        if (!propertyList) return; // nothing to render if container missing
        // Ensure property list behaves as a full-width slider
        if (!propertyList.classList.contains('similar-properties-slider')) propertyList.classList.add('similar-properties-slider');
        
        // Show the filtered results section (even with no results, so "no results" message can display)
        const filteredResultsSection = document.getElementById('filtered-results-section');
        if (filteredResultsSection) {
            filteredResultsSection.style.display = 'block';
        }
        
        // Handle empty results
        if (props.length === 0 && !append) {
            propertyList.innerHTML = `
                <div class="no-results-message">
                    <div class="no-results-icon">🔍</div>
                    <h3>No Properties Found</h3>
                    <p>Try adjusting your search filters or browse all properties</p>
                </div>
            `;
            displayedProperties = [];
            return;
        }
        
        const startIndex = (currentPage - 1) * propertiesPerPage;
        const endIndex = startIndex + propertiesPerPage;
        const propertiesToShow = props.slice(startIndex, endIndex);

        if (!append) {
            propertyList.innerHTML = '';
            displayedProperties = [];
        }

        // Helper to resolve a property's image array, preferring persisted remote URLs,
        // then local data-URLs stored under `property._localPhotosKey`, then `property.images` or `property.image`.
        function getPropertyImages(property){
            try{
                if(!property) return [];
                // If property has an explicit localPhotos key, prefer those data-URLs
                if(property._localPhotosKey){
                    try{
                        const raw = localStorage.getItem(property._localPhotosKey);
                        if(raw){ const arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length) return arr; }
                    }catch(e){}
                }
                // Prefer photoUrls / photos (may contain data: or remote URLs)
                if(Array.isArray(property.photoUrls) && property.photoUrls.length) return property.photoUrls;
                if(Array.isArray(property.photos) && property.photos.length) return property.photos;
                // Then images array
                if(Array.isArray(property.images) && property.images.length) return property.images;
                // Single image field
                if(property.image) return [property.image];
                return [];
            }catch(e){ return []; }
        }

        propertiesToShow.forEach(property => {
            // Render homepage post using the similar-property-card layout
            const imgs = getPropertyImages(property);
            const mainImage = imgs && imgs.length ? imgs[0] : '';
            const totalMedia = imgs ? imgs.length : 0;
            const imageCountBadge = totalMedia >= 2 ? `<div class="image-counter">${totalMedia} 📷</div>` : '';
            const categoryClass = property.postTo || (property.featured ? 'featured' : (property.hot ? 'hot' : 'available'));
            const categoryLabel = categoryClass === 'hot' ? '🔥 Hot' : categoryClass === 'featured' ? '⭐ Featured' : '✓ Available';

            const a = document.createElement('a');
            a.href = `property-detail.html?id=${property.id}&category=${categoryClass}`;
            a.className = 'similar-property-card';

            a.innerHTML = `
                <div style="position: relative;">
                    <img src="${mainImage}" alt="${property.title}" class="similar-property-image">
                    ${imageCountBadge}
                </div>
                <div class="similar-property-info">
                    <div class="similar-property-price">${typeof property.price === 'number' ? '€' + property.price.toLocaleString() : property.price}</div>
                    <div class="similar-property-title">${property.title}</div>
                    ${property.bedrooms || property.bathrooms || property.area ? `<div class="similar-property-details">${property.bedrooms || 0} bed • ${property.bathrooms || 0} bath • ${property.area || 0} m²</div>` : ''}\n                    <div class="similar-property-location">${property.location} ${property.date ? '• ' + property.date : ''}</div>
                </div>
                <div class="similar-property-footer">
                    <span class="similar-property-label ${categoryClass}">${categoryLabel}</span>
                    <button class="similar-property-like-btn" data-id="${property.id}">♥</button>
                </div>
            `;

            propertyList.appendChild(a);
            displayedProperties.push(property);
        });

        // Add event listeners for like buttons (support both layouts)
        document.querySelectorAll('.like-btn, .similar-property-like-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const idRaw = this.dataset.id || this.dataset.propertyId || this.getAttribute('data-id') || this.getAttribute('data-property-id');
                const id = isNaN(parseInt(idRaw)) ? idRaw : parseInt(idRaw);
                const liked = JSON.parse(localStorage.getItem('likedProperties') || '[]');
                const exists = liked.findIndex(x => String(x) === String(id));
                if (exists > -1) {
                    liked.splice(exists, 1);
                    this.classList.remove('liked');
                } else {
                    liked.push(id);
                    this.classList.add('liked');
                }
                localStorage.setItem('likedProperties', JSON.stringify(liked));
            });
        });

        // Load liked state
        const liked = JSON.parse(localStorage.getItem('likedProperties') || '[]');
        document.querySelectorAll('.like-btn, .similar-property-like-btn').forEach(btn => {
            const idRaw = btn.dataset.id || btn.dataset.propertyId || btn.getAttribute('data-id') || btn.getAttribute('data-property-id');
            if (!idRaw) return;
            if (liked.find(x => String(x) === String(idRaw))) {
                btn.classList.add('liked');
            }
        });

        // Update load more button visibility
        updateLoadMoreButton(props.length);
        // Ensure like buttons are wired for newly rendered cards
        initializeGlobalLikeButtons();
    }

    function updateLoadMoreButton(totalProperties) {
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            const totalDisplayed = currentPage * propertiesPerPage;
            if (totalDisplayed >= totalProperties) {
                loadMoreBtn.style.display = 'none';
            } else {
                loadMoreBtn.style.display = 'block';
            }
        }
    }

    function renderFeaturedProperties() {
        const featuredList = document.getElementById('featured-list');
        const section = document.getElementById('featured-section');
        if (!featuredList) return;

        // Collect all featured properties and show up to 20, arranged as two rows of 10
        let featuredProperties = properties.filter(property => property.featured);
        // Prefer newest admin posts first (admin inserts new ones at start). If ids are numeric, use them.
        featuredProperties.sort((a, b) => {
            const ai = parseInt(a.id, 10) || 0;
            const bi = parseInt(b.id, 10) || 0;
            return bi - ai;
        });
        const featuredLimit = 20;
        const featuredToShow = featuredProperties.slice(0, featuredLimit);

            featuredList.innerHTML = '';

            if (featuredToShow.length === 0) {
                if (section) section.style.display = 'none';
                return;
            }
            
            if (section) section.style.display = 'block';

            // Use featuredList as a horizontal slider so each featured card fills the viewport
            featuredList.classList.add('similar-properties-slider');

            featuredToShow.forEach((property, idx) => {
                const placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2NjY2MiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjAuM2VtIj5JbWFnZTwvdGV4dD48L3N2Zz4=';
                const fImgs = resolvePropertyImages(property);
                const mainImage = fImgs && fImgs.length ? fImgs[0] : placeholder;
                const featuredTotalMedia = fImgs ? fImgs.length : (property.image ? 1 : 0);
                const featuredMediaBadge = featuredTotalMedia >= 2 ? `<div class="image-counter">${featuredTotalMedia} 📷</div>` : '';
                const categoryClass = property.featured ? 'featured' : (property.hot ? 'hot' : 'available');
                const categoryLabel = categoryClass === 'hot' ? '🔥 Hot' : categoryClass === 'featured' ? '⭐ Featured' : '✓ Available';

                const card = document.createElement('a');
                card.className = 'similar-property-card';
                card.href = `property-detail.html?id=${property.id}&category=${categoryClass}`;
                card.innerHTML = `
                    <div style="position: relative;">
                        <img src="${mainImage}" alt="${property.title}" class="similar-property-image" onload="this.setAttribute('loaded','')" onerror="this.onerror=null;this.style.display='none';this.parentNode.classList.add('image-placeholder');this.setAttribute('loaded','')">
                        ${featuredMediaBadge}
                    </div>
                    <div class="similar-property-info">
                        <div class="similar-property-price">${typeof property.price === 'number' ? '€' + property.price.toLocaleString() : property.price}</div>
                        <div class="similar-property-title">${property.title}</div>
                        ${property.bedrooms || property.bathrooms || property.area ? `<div class="similar-property-details">${property.bedrooms || 0} bed • ${property.bathrooms || 0} bath • ${property.area || 0} m²</div>` : ''}
                        <div class="similar-property-location">${property.location || ''}</div>
                    </div>
                    <div class="similar-property-footer">
                        <span class="similar-property-label ${categoryClass}">${categoryLabel}</span>
                        <button class="similar-property-like-btn" data-id="${property.id}">♡</button>
                    </div>
                `;

                // Make card clickable / keyboard accessible
                card.setAttribute('role', 'button');
                card.tabIndex = 0;
                const navigateFeatured = () => { window.location.href = `property-detail.html?id=${property.id}&category=featured`; };
                card.addEventListener('click', navigateFeatured);
                card.addEventListener('keypress', (e) => { if (e.key === 'Enter') navigateFeatured(); });

                featuredList.appendChild(card);
            });

        // Add event listeners for like buttons in featured section (support data-id and data-property-id)
        function _handleLikeClickFeatured(e) {
            e.stopPropagation();
            const btn = e.currentTarget;
            const idStr = btn.dataset.propertyId || btn.dataset.id;
            if (!idStr) return;
            const id = String(idStr);
            const liked = JSON.parse(localStorage.getItem('likedProperties') || '[]');
            const existIndex = liked.findIndex(x => String(x) === id);
            if (existIndex > -1) {
                liked.splice(existIndex, 1);
                btn.textContent = '♡';
                btn.classList.remove('liked');
            } else {
                liked.push(id);
                btn.textContent = '♥';
                btn.classList.add('liked');
            }
            localStorage.setItem('likedProperties', JSON.stringify(liked));
        }

        document.querySelectorAll('#featured-list .like-btn, #featured-list .similar-property-like-btn').forEach(btn => btn.addEventListener('click', _handleLikeClickFeatured));

        // Initialize liked state
        const _likedFeatured = JSON.parse(localStorage.getItem('likedProperties') || '[]');
        document.querySelectorAll('#featured-list .like-btn, #featured-list .similar-property-like-btn').forEach(btn => {
            const idStr = btn.dataset.propertyId || btn.dataset.id;
            if (!idStr) return;
            if (_likedFeatured.includes(String(idStr)) || _likedFeatured.includes(Number(idStr))) {
                btn.textContent = '♥';
                btn.classList.add('liked');
            }
        });
        // Also ensure global wiring for these buttons
        initializeGlobalLikeButtons();
    }

    // Render hot properties: 2 horizontal rows, 10 posts each (20 total)
    function renderHotProperties() {
        console.log('renderHotProperties called, properties length:', properties ? properties.length : 'undefined');
        const row1 = document.getElementById('hot-row-1');
        const row2 = document.getElementById('hot-row-2');
        const section = document.getElementById('hot-properties-section');
        
        if (!row1 || !row2 || !properties || properties.length === 0) {
            console.log('Missing elements or no properties');
            if (section) section.style.display = 'none';
            return;
        }
        
        if (section) section.style.display = 'block';

        // Only show properties explicitly marked as hot by admin.
        // Do NOT fill with non-hot properties to avoid mixing sections.
        const hotOnly = properties.filter(p => p.hot);
        const count = Math.min(20, hotOnly.length);
        const selected = hotOnly.slice(0, count);

        // Clear rows
        row1.innerHTML = '';
        row2.innerHTML = '';
        // Make hot rows act as sliders (each card will fill the viewport width)
        if (!row1.classList.contains('similar-properties-slider')) row1.classList.add('similar-properties-slider');
        if (!row2.classList.contains('similar-properties-slider')) row2.classList.add('similar-properties-slider');

        selected.forEach((property, idx) => {
            const placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2NjY2MiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjAuM2VtIj5JbWFnZTwvdGV4dD48L3N2Zz4=';
            const hImgs = resolvePropertyImages(property);
            const img = hImgs && hImgs.length ? hImgs[0] : placeholder;
            const hotTotalMedia = hImgs ? hImgs.length : (property.image ? 1 : 0);
            const hotMediaBadge = hotTotalMedia >= 2 ? `<div class="image-counter">${hotTotalMedia} 📷</div>` : '';
            const categoryClass = property.featured ? 'featured' : (property.hot ? 'hot' : 'available');
            const categoryLabel = categoryClass === 'hot' ? '🔥 Hot' : categoryClass === 'featured' ? '⭐ Featured' : '✓ Available';

            const card = document.createElement('a');
            card.className = 'similar-property-card';
            card.href = `property-detail.html?id=${property.id}&category=hot`;
            card.innerHTML = `
                <div style="position:relative;">
                        <img src="${img}" alt="${property.title}" class="similar-property-image" onload="this.setAttribute('loaded', '')" onerror="this.onerror=null;this.style.display='none';this.parentNode.classList.add('image-placeholder');this.setAttribute('loaded','')">
                        ${hotMediaBadge}
                </div>
                <div class="similar-property-info">
                    <div class="similar-property-price">${typeof property.price === 'number' ? '€' + property.price.toLocaleString() : property.price}</div>
                    <div class="similar-property-title">${property.title}</div>
                    ${property.bedrooms || property.bathrooms || property.area ? `<div class="similar-property-details">${property.bedrooms || 0} bed • ${property.bathrooms || 0} bath • ${property.area || 0} m²</div>` : ''}\n                    <div class="similar-property-location">${property.location}</div>
                </div>
                <div class="similar-property-footer">
                    <span class="similar-property-label ${categoryClass}">${categoryLabel}</span>
                    <button class="similar-property-like-btn" data-id="${property.id}">♡</button>
                </div>
            `;

            if (idx < 10) row1.appendChild(card);
            else row2.appendChild(card);
        });

        // Wire like buttons for hot rows
        function _handleLikeHot(e) {
            e.stopPropagation();
            const btn = e.currentTarget;
            const idStr = btn.dataset.propertyId || btn.dataset.id;
            if (!idStr) return;
            const id = String(idStr);
            const liked = JSON.parse(localStorage.getItem('likedProperties') || '[]');
            const existIndex = liked.findIndex(x => String(x) === id);
            if (existIndex > -1) {
                liked.splice(existIndex, 1);
                btn.textContent = '♡';
                btn.classList.remove('liked');
            } else {
                liked.push(id);
                btn.textContent = '♥';
                btn.classList.add('liked');
            }
            localStorage.setItem('likedProperties', JSON.stringify(liked));
        }

        document.querySelectorAll('#hot-row-1 .like-btn, #hot-row-2 .like-btn, #hot-row-1 .similar-property-like-btn, #hot-row-2 .similar-property-like-btn').forEach(b => b.addEventListener('click', _handleLikeHot));

        // Initialize liked state for hot rows
        const _likedHot = JSON.parse(localStorage.getItem('likedProperties') || '[]');
        document.querySelectorAll('#hot-row-1 .like-btn, #hot-row-2 .like-btn, #hot-row-1 .similar-property-like-btn, #hot-row-2 .similar-property-like-btn').forEach(btn => {
            const idStr = btn.dataset.propertyId || btn.dataset.id;
            if (!idStr) return;
            if (_likedHot.includes(String(idStr)) || _likedHot.includes(Number(idStr))) {
                btn.textContent = '♥';
                btn.classList.add('liked');
            }
        });
        // Ensure global like wiring for hot rows
        initializeGlobalLikeButtons();
    }

    // Render available/admin-saved properties into the Available section
    function renderAvailableProperties() {
        const availableList = document.getElementById('available-list');
        const section = document.getElementById('listings-section');
        if (!availableList) return;

        // Properties explicitly posted as 'available' OR not marked hot/featured
        let availableProps = properties.filter(p => {
            if (!p) return false;
            if (p.postTo) return p.postTo === 'available';
            return !p.hot && !p.featured;
        });

        // Sort ascending by numeric id (oldest -> newest) when ids are numeric strings
        availableProps.sort((a, b) => {
            const ai = parseInt(a.id, 10) || 0;
            const bi = parseInt(b.id, 10) || 0;
            return ai - bi;
        });

        // Clear existing and enable slider behavior
        availableList.innerHTML = '';
        if (!availableList.classList.contains('similar-properties-slider')) availableList.classList.add('similar-properties-slider');

        if (availableProps.length === 0) {
            if (section) section.style.display = 'none';
            return;
        }
        
        if (section) section.style.display = 'block';

        // Create property cards using the same hot/featured card layout so Available
        // listings visually match Hot/Featured (badge, like button, clickable card).
        availableProps.slice(0, 50).forEach(prop => {
            const placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2NjY2MiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjAuM2VtIj5JbWFnZTwvdGV4dD48L3N2Zz4=';
            const aImgs = resolvePropertyImages(prop);
            const imgSrc = aImgs && aImgs.length ? aImgs[0] : (prop.image || placeholder);
            const availTotalMedia = aImgs ? aImgs.length : (prop.image ? 1 : 0);
            const availMediaBadge = availTotalMedia >= 2 ? `<div class="image-counter">${availTotalMedia} 📷</div>` : '';
            const card = document.createElement('a');
            card.className = 'similar-property-card';
            card.href = `property-detail.html?id=${prop.id}&category=available`;
            card.innerHTML = `
                <div style="position:relative;">
                    <img src="${imgSrc}" alt="${prop.title || 'Property'}" class="similar-property-image" onload="this.setAttribute('loaded', '')" onerror="this.onerror=null;this.style.display='none';this.parentNode.classList.add('image-placeholder');this.setAttribute('loaded','')">
                    ${availMediaBadge}
                </div>
                <div class="similar-property-info">
                    <div class="similar-property-price">€${(prop.price||0).toLocaleString()}</div>
                    <div class="similar-property-title">${prop.title || 'Untitled'}</div>
                    ${prop.bedrooms || prop.bathrooms || prop.area ? `<div class="similar-property-details">${prop.bedrooms || 0} bed • ${prop.bathrooms || 0} bath • ${prop.area || 0} m²</div>` : ''}
                    <div class="similar-property-location">${prop.location||''}</div>
                </div>
                <div class="similar-property-footer">
                    <span class="similar-property-label available">✅ Available</span>
                    <button class="similar-property-like-btn" data-id="${prop.id}">♡</button>
                </div>
            `;

            availableList.appendChild(card);
        });

        // Add like button handlers for available list
        document.querySelectorAll('#available-list .like-btn, #available-list .similar-property-like-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const id = this.dataset.propertyId || this.getAttribute('data-property-id');
                const liked = JSON.parse(localStorage.getItem('likedProperties') || '[]');
                const idx = liked.indexOf(id);
                if (idx > -1) {
                    liked.splice(idx, 1);
                    this.textContent = '♡';
                    this.classList.remove('liked');
                } else {
                    liked.push(id);
                    this.textContent = '♥';
                    this.classList.add('liked');
                }
                localStorage.setItem('likedProperties', JSON.stringify(liked));
            });
        });

        // Initialize liked state
        const likedInit = JSON.parse(localStorage.getItem('likedProperties') || '[]');
        document.querySelectorAll('#available-list .like-btn, #available-list .similar-property-like-btn').forEach(btn => {
            const id = btn.dataset.id || btn.dataset.propertyId || btn.getAttribute('data-property-id');
            if (likedInit.includes(String(id)) || likedInit.includes(Number(id))) {
                btn.textContent = '♥';
                btn.classList.add('liked');
            }
        });
        // Wire global like buttons for available list
        initializeGlobalLikeButtons();
    }

    function filterProperties() {
        const searchTerm = (searchInput && searchInput.value) ? searchInput.value.toLowerCase() : '';
        // Removed advanced filters
        const minPrice = 0;
        const maxPrice = Infinity;
        const bedrooms = '';
        const location = '';
        const sortBy = 'date';

        let filtered = properties.filter(property => {
            let typeMatch = true;
            let locationMatch = true;
            let priceMatch = true;
            let searchMatch = true;

            // Handle property type filtering
            if (currentCategory !== 'all') {
                if (currentCategory === 'favorites') {
                    const likedIds = JSON.parse(localStorage.getItem('likedProperties') || '[]');
                    typeMatch = likedIds.includes(property.id);
                } else if (currentCategory === 'land') {
                    typeMatch = property.type === 'sale' && property.title.toLowerCase().includes('land');
                } else if (currentCategory === 'house') {
                    typeMatch = property.type === 'sale' && (property.title.toLowerCase().includes('house') || property.title.toLowerCase().includes('villa'));
                } else if (currentCategory === 'rent') {
                    typeMatch = property.type === 'rent';
                } else {
                    typeMatch = property.type === currentCategory;
                }
            }

            // Handle location filtering
            if (location !== '' && location !== 'all') {
                locationMatch = property.location.toLowerCase().includes(location.toLowerCase());
            }

            // Handle price filtering
            if (minPrice > 0) {
                priceMatch = priceMatch && property.price >= minPrice;
            }
            if (maxPrice < Infinity) {
                priceMatch = priceMatch && property.price <= maxPrice;
            }

            // Handle bedrooms filtering
            if (bedrooms !== '') {
                const bedroomCount = parseInt(bedrooms);
                if (bedroomCount === 3) {
                    priceMatch = priceMatch && property.bedrooms >= bedroomCount;
                } else {
                    priceMatch = priceMatch && property.bedrooms === bedroomCount;
                }
            }

            // Handle search term
            if (searchTerm !== '') {
                searchMatch = property.title.toLowerCase().includes(searchTerm) ||
                             property.location.toLowerCase().includes(searchTerm);
            }

            return typeMatch && locationMatch && priceMatch && searchMatch;
        });

        // For "All Locations" or "All", show mixed properties from 50 random countries
        if ((location === '' || location === 'all') && currentCategory === 'all') {
            const randomCountries = getRandomCountries(50);
            filtered = filtered.filter(property => {
                const country = property.location.split(',')[0].trim();
                return randomCountries.includes(country);
            });
        }

        // Sort
        if (sortBy === 'price-low') {
            filtered.sort((a, b) => a.price - b.price);
        } else if (sortBy === 'price-high') {
            filtered.sort((a, b) => b.price - a.price);
        } else {
            // Default sort by date (newest first, assuming date is string)
            filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        filteredProperties = filtered;
        currentPage = 1; // Reset to first page when filtering
        renderProperties(filteredProperties);
    }

    function getRandomCountries(count) {
        const shuffled = [...countries].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    // Initial render - show mixed properties from 50 random countries
    function initializeDisplay() {
        const randomCountries = getRandomCountries(50);
        const initialProperties = properties.filter(property => {
            const country = property.location.split(',')[0].trim();
            return randomCountries.includes(country);
        });
        filteredProperties = initialProperties;
        currentPage = 1;
        renderProperties(filteredProperties);
    }

    // Do not auto-show search results on page load. Search results
    // should only appear after an explicit search or filter action.

    // Initialize DOM references and bind search handlers when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        propertyList = document.getElementById('property-list');
        searchInput = document.getElementById('header-search-input') || document.getElementById('search-input') || null;

        const headerSearchForm = document.getElementById('header-search-form');
        if (headerSearchForm) {
            headerSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                filterProperties();
            });
        }

        const quickSearchForm = document.getElementById('quick-search-form');
        if (quickSearchForm) {
            quickSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                filterProperties();
            });
        }
        // Wire global like buttons present in static HTML
        initializeGlobalLikeButtons();
    });

    // Property valuation: accept a valuation request (min/max) and acknowledge submission
    const valuationForm = document.getElementById('valuation-form');
    if (valuationForm) {
        valuationForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const propertyType = document.getElementById('property-type') ? document.getElementById('property-type').value : '';
            const location = document.getElementById('location') ? document.getElementById('location').value : '';
            const minPrice = document.getElementById('min-price') ? document.getElementById('min-price').value : '';
            const maxPrice = document.getElementById('max-price') ? document.getElementById('max-price').value : '';

            // Simple acknowledgement flow: notify user we'll respond soon
            showNotification('Thank you — we received your valuation request. Our team will contact you soon.');

            // Optionally show a brief inline confirmation on the page if area exists
            const valResultEl = document.getElementById('valuation-result');
            if (valResultEl) {
                valResultEl.innerHTML = `
                    <h3>Request Received</h3>
                    <p>Thanks — your valuation request for <strong>${propertyType || 'property'}</strong> in <strong>${location || 'your chosen location'}</strong> has been received.</p>
                    <p>Requested price range: <strong>€${minPrice || '—'} - €${maxPrice || '—'}</strong></p>
                    <p>Our agents will review and get back to you shortly.</p>`;
                valResultEl.style.display = 'block';
            }

            valuationForm.reset();
        });
    }
    const mortgageForm = document.getElementById('mortgage-form');
    if (mortgageForm) {
        mortgageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const loanAmount = parseFloat(document.getElementById('loan-amount').value) || 0;
            const interestRateAnnual = parseFloat(document.getElementById('interest-rate').value) || 0;
            const interestRate = interestRateAnnual / 100 / 12;
            const loanTermMonths = (parseFloat(document.getElementById('loan-term').value) || 0) * 12;

            if (loanAmount <= 0 || interestRate <= 0 || loanTermMonths <= 0) {
                showNotification('Please enter valid loan amount, interest rate and term.');
                return;
            }

            const monthlyPayment = (loanAmount * interestRate * Math.pow(1 + interestRate, loanTermMonths)) / (Math.pow(1 + interestRate, loanTermMonths) - 1);
            const totalPayment = monthlyPayment * loanTermMonths;
            const totalInterest = totalPayment - loanAmount;

            // Write numeric-only values into the result spans
            const monthlyEl = document.getElementById('monthly-payment');
            const totalEl = document.getElementById('total-payment');
            const interestEl = document.getElementById('total-interest');
            const incomeEl = document.getElementById('required-income');

            if (monthlyEl) monthlyEl.textContent = `€${monthlyPayment.toFixed(2)}`;
            if (totalEl) totalEl.textContent = `€${totalPayment.toFixed(2)}`;
            if (interestEl) interestEl.textContent = `€${totalInterest.toFixed(2)}`;

            // Approximate required annual income assuming 30% of gross monthly income goes to mortgage
            if (incomeEl) {
                const requiredAnnual = Math.round((monthlyPayment / 0.30) * 12);
                incomeEl.textContent = `€${requiredAnnual.toLocaleString()}`;
            }

            const resultsEl = document.getElementById('results');
            if (resultsEl) resultsEl.style.display = 'block';
        });

        // Reset button
        const resetBtn = document.getElementById('reset-calc');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                mortgageForm.reset();
                const resultsEl = document.getElementById('results');
                if (resultsEl) resultsEl.style.display = 'none';
            });
        }
    }
    const newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showNotification('Thank you for subscribing to our newsletter!');
            newsletterForm.reset();
        });
    }
    const backToTopBtn = document.getElementById('back-to-top');
    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTopBtn.style.display = 'block';
            } else {
                backToTopBtn.style.display = 'none';
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Save the message to localStorage for admin to view
            const formData = new FormData(contactForm);
            const message = {
                id: 'msg-' + Date.now(),
                name: formData.get('name'),
                email: formData.get('email'),
                phone: formData.get('phone') || 'N/A',
                subject: formData.get('subject'),
                message: formData.get('message'),
                timestamp: new Date().toLocaleString(),
                read: false
            };
            
            const messages = JSON.parse(localStorage.getItem('contactMessages') || '[]');
            messages.unshift(message); // Add to the beginning
            localStorage.setItem('contactMessages', JSON.stringify(messages));
            
            showNotification('Thank you for your message! We\'ll get back to you soon.');
            contactForm.reset();
        });
    }
    const postAdModal = document.getElementById('post-ad-modal');
    const chatModal = document.getElementById('chat-modal');
    const postAdBtn = document.getElementById('post-ad-btn');
    const chatBtn = document.getElementById('chat-btn');
    const closeBtns = document.querySelectorAll('.close');

    if (postAdBtn && postAdModal) {
        postAdBtn.addEventListener('click', () => {
            postAdModal.style.display = 'block';
        });
    }

    if (chatBtn && chatModal) {
        chatBtn.addEventListener('click', () => {
            chatModal.style.display = 'block';
            if (typeof loadChatMessages === 'function') loadChatMessages();
        });
    }


    const notificationBtn = document.getElementById('notification-btn');
    const walletBtn = document.getElementById('wallet-btn');
    const notificationsModal = document.getElementById('notifications-modal');
    const transactionsModal = document.getElementById('transactions-modal');

    if (notificationBtn && notificationsModal) {
        notificationBtn.addEventListener('click', () => {
            notificationsModal.style.display = 'block';
        });
    }

    if (walletBtn && transactionsModal) {
        walletBtn.addEventListener('click', () => {
            transactionsModal.style.display = 'block';
        });
    }

    if (closeBtns && closeBtns.length) {
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (postAdModal) postAdModal.style.display = 'none';
                if (chatModal) chatModal.style.display = 'none';
                if (notificationsModal) notificationsModal.style.display = 'none';
                if (transactionsModal) transactionsModal.style.display = 'none';
            });
        });
    }

    // Adjust static anchor-based property cards that exist in HTML
    function adjustStaticPropertyCards(){
        document.querySelectorAll('a.property-card').forEach(a => {
            // skip cards that were already transformed
            if (a.classList.contains('transformed')) return;

            // wrap image into container
            const img = a.querySelector('img');
            if (img){
                const imgContainer = document.createElement('div');
                imgContainer.className = 'property-image-container';
                a.insertBefore(imgContainer, img);
                imgContainer.appendChild(img);

                // move any existing top-left image count into image-count-badge
                const existingCount = a.querySelector('.image-count');
                if (existingCount){
                    const countBadge = document.createElement('div');
                    countBadge.className = 'image-count-badge';
                    countBadge.textContent = existingCount.textContent;
                    imgContainer.appendChild(countBadge);
                    existingCount.remove();
                }
            }

            // move like button into price row
            const info = a.querySelector('.property-info');
            if (info){
                const priceEl = info.querySelector('.price') || info.querySelector('.property-price');
                const likeBtn = a.querySelector('.like-btn');
                if (priceEl){
                    // create price-row
                    let priceRow = info.querySelector('.property-price-row');
                    if(!priceRow){
                        priceRow = document.createElement('div');
                        priceRow.className = 'property-price-row';
                        priceEl.parentNode.insertBefore(priceRow, priceEl);
                        priceRow.appendChild(priceEl);
                    }
                    if (likeBtn){
                        priceRow.appendChild(likeBtn);
                    }
                }

                // clean up old location-with-like like buttons
                const locLike = info.querySelector('.location-with-like .like-btn');
                if (locLike && locLike !== likeBtn){ locLike.remove(); }
            }

            a.classList.add('transformed');
        });
    }

    // run adjustments for static cards on load
    document.addEventListener('DOMContentLoaded', adjustStaticPropertyCards);

    window.addEventListener('click', (event) => {
        if (postAdModal && event.target === postAdModal) {
            postAdModal.style.display = 'none';
        }
        if (chatModal && event.target === chatModal) {
            chatModal.style.display = 'none';
        }
        if (notificationsModal && event.target === notificationsModal) {
            notificationsModal.style.display = 'none';
        }
        if (transactionsModal && event.target === transactionsModal) {
            transactionsModal.style.display = 'none';
        }
    });

    // Post ad form
    const postAdForm = document.getElementById('post-ad-form');
    if (postAdForm) postAdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // If the user selected files via the new #ad-media input, upload them to the server
        const mediaInput = document.getElementById('ad-media');
        let images = [];
        if (mediaInput && mediaInput.files && mediaInput.files.length > 0) {
            const files = Array.from(mediaInput.files);
            try {
                const form = new FormData();
                files.forEach(f => form.append('files', f));
                const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
                // poster may be apiFetch which forwards to API_BASE; it will return a Response
                const resp = await poster('/api/upload-photos', { method: 'POST', body: form });
                if (resp && typeof resp.json === 'function') {
                    const j = await resp.json();
                    if (Array.isArray(j.urls) && j.urls.length) images = j.urls;
                }
            } catch (e) {
                console.warn('Image upload failed, falling back to converting files to data URLs for persistence', e);
                // Convert files to data URLs instead of using blob/object URLs which are not persistent across reloads
                const files = Array.from(mediaInput.files);
                try {
                    const converted = await Promise.all(files.map(f => window.fileToDataUrlWithCompression ? window.fileToDataUrlWithCompression(f) : new Promise((resolve)=>{ try{ const r = new FileReader(); r.onload = ()=>resolve(r.result); r.onerror = ()=>resolve(null); r.readAsDataURL(f);}catch(e){resolve(null)} } )));
                    images = converted.filter(Boolean);
                } catch (convErr) {
                    images = [];
                }
            }
        }

        // Build a frontend display object (kept for immediate UI) and a backend-compatible object
        const displayProperty = {
            id: Date.now(),
            title: document.getElementById('ad-title').value,
            price: parseInt(document.getElementById('ad-price').value) || 0,
            type: document.getElementById('ad-type').value,
            bedrooms: parseInt(document.getElementById('ad-bedrooms').value) || 0,
            bathrooms: parseInt(document.getElementById('ad-bathrooms').value) || 0,
            area: parseInt(document.getElementById('ad-area').value) || 0,
            location: document.getElementById('ad-location').value,
            images: images.length ? images : [document.getElementById('ad-image').value || getRandomPropertyImage()],
            featured: (document.getElementById('ad-featured') ? document.getElementById('ad-featured').checked : false),
            date: 'Just now'
        };

        // Map to backend shape expected by /api/properties / addPropertyWithPhotos
        const backendProperty = {
            user_id: _getUserId() || null,
            title: displayProperty.title,
            description: (document.getElementById('ad-description') ? document.getElementById('ad-description').value : (displayProperty.type || '')),
            price: displayProperty.price,
            address: displayProperty.location || '',
            city: (document.getElementById('ad-city') ? document.getElementById('ad-city').value : ''),
            state: (document.getElementById('ad-state') ? document.getElementById('ad-state').value : ''),
            zip_code: (document.getElementById('ad-zip') ? document.getElementById('ad-zip').value : ''),
            image_url: displayProperty.images && displayProperty.images.length ? displayProperty.images[0] : null
        };

        // Try to save via API (saveProperty handles API/localStorage fallback). Ensure photo URLs are passed.
        try {
            await saveProperty(Object.assign({}, backendProperty, { photos: displayProperty.images }));
        } catch (err) {
            // saveProperty already falls back to localStorage; ensure display state is updated
            properties.push(displayProperty);
        }

        // Ensure the new property appears in the available listings when appropriate
        const searchTermNow = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
        if (currentCategory === 'all' && !searchTermNow) {
            filteredProperties = properties.slice();
            currentPage = 1;
            renderProperties(filteredProperties);
        } else {
            filterProperties();
        }

        // Refresh featured and hot sections
        renderFeaturedProperties();
        if (document.getElementById('hot-properties-section')) renderHotProperties();

        postAdForm.reset();
        if (postAdModal) postAdModal.style.display = 'none';
        showNotification('Property posted successfully!');
    });

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = '#4CAF50';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '4px';
        notification.style.zIndex = '1001';
        document.body.appendChild(notification);
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 3000);
    }

    // Chat functionality
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatBtn = document.getElementById('send-chat');

    function loadChatMessages() {
        const messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
        chatMessages.innerHTML = '';
        messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.textContent = `${msg.timestamp}: ${msg.text}`;
            chatMessages.appendChild(msgDiv);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendMessage(text) {
        const messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
        const newMsg = {
            text: text,
            timestamp: new Date().toLocaleString()
        };
        messages.push(newMsg);
        localStorage.setItem('chatMessages', JSON.stringify(messages));
        loadChatMessages();
    }

    // Simple conversation API for per-conversation messaging (used by messages.html and property detail)
    const _convSubscribers = {};

    // Get user-specific conversation key
    function _getUserId() {
        try {
            // Prefer cached server-provided user if available
            if (window._wispaCurrentUser && window._wispaCurrentUser.id) return window._wispaCurrentUser.id;
            // Trigger an async fetch to populate cache for future calls
            if (window.getCurrentUser) window.getCurrentUser().catch(()=>{});
            // Fallback to localStorage only if present (admin pages shim this)
            const wispaUser = (typeof localStorage !== 'undefined') ? localStorage.getItem('wispaUser') : null;
            if (!wispaUser) return null;
            const userData = JSON.parse(wispaUser);
            return userData.id;
        } catch (e) { return null; }
    }

    function _convKey(convId) { 
        const userId = _getUserId();
        if (!userId) return 'wispaMessages_' + convId; // fallback if not logged in
        return 'wispaMessages_' + userId + '_' + convId; 
    }

    window.getConversationMessages = function(convId) {
        try { return JSON.parse(localStorage.getItem(_convKey(convId)) || '[]'); } catch (e) { return []; }
    };

    window.saveConversationMessage = function(convId, sender, text) {
        if (!convId) return;
        const userId = _getUserId();
        if (!userId) {
            console.log('User not logged in, cannot save message');
            return;
        }

        const key = _convKey(convId);
        const now = Date.now();
        const list = window.getConversationMessages(convId);
        
        // Capture user info if sender is 'user'
        const msg = { sender: sender, text: String(text), ts: now };
        // If this is a property conversation and the sender is the user, attach
        // lightweight property details (only on first message ideally) so admin
        // receives context and can build a thread that includes the sent property.
        try {
            if (typeof convId === 'string' && convId.startsWith('property-') && sender === 'user') {
                const prop = (typeof window !== 'undefined' && window.__currentProperty) ? window.__currentProperty : null;
                if (prop) {
                    msg.meta = Object.assign({}, msg.meta || {}, { property: { id: prop.id, title: prop.title, price: prop.price, location: prop.location, image: prop.image } });
                }
            }
        } catch (e) {}
        if (sender === 'user') {
            try {
                const u = (window._wispaCurrentUser) ? window._wispaCurrentUser : (JSON.parse(localStorage.getItem('wispaUser') || '{}'));
                if (u) {
                    if (u.username) msg.userName = u.username;
                    if (u.email) msg.userEmail = u.email;
                    if (u.id) msg.userId = u.id;
                }
            } catch (e) { /* ignore */ }
        }

        list.push(msg);
        // Try to persist message to server; fallback to localStorage.
        // If there are pending attachments selected via the global toolbar, upload them first.
        (async function(){
            try {
                // handle attachments
                try {
                    if (window._wispaPendingFiles && Array.isArray(window._wispaPendingFiles) && window._wispaPendingFiles.length){
                        try{
                            const fd = new FormData();
                            window._wispaPendingFiles.forEach(f=>fd.append('files', f));
                            const poster = window.apiFetch ? window.apiFetch : fetch;
                            const up = await poster('/api/upload-attachments', { method: 'POST', body: fd });
                            if (up && up.ok){
                                const uj = await up.json();
                                if (uj && Array.isArray(uj.urls) && uj.urls.length){
                                    msg.meta = msg.meta || {};
                                    msg.meta.attachments = uj.urls;
                                }
                            }
                        }catch(e){ /* ignore upload errors and continue to send message without attachments */ }
                        // clear pending files after attempt
                        try{ window._wispaPendingFiles = []; }catch(e){}
                    }
                } catch(e){}

                const opts = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ convId: convId, message: msg })
                };
                try {
                    const poster = window.apiFetch ? window.apiFetch : fetch;
                    const r = await poster('/api/conversations/messages', opts);
                    if (!r || !r.ok) throw new Error('Post failed');
                } catch (e) {
                    // fallback to localStorage
                    try { localStorage.setItem(key, JSON.stringify(list)); } catch(err){}
                }
            } catch (e) {
                // fallback to localStorage
                try { localStorage.setItem(key, JSON.stringify(list)); } catch(err){}
            }
        })();

        // notify same-tab subscribers
        if (_convSubscribers[convId]) {
            _convSubscribers[convId].forEach(cb => {
                try { cb(list); } catch(e){}
            });
        }

        // also dispatch a custom event for any other listeners
        try { window.dispatchEvent(new CustomEvent('wispa:message', { detail: { convId, msg } })); } catch(e){}
        
        // Update user-specific conversation index
        try {
            const convsKey = 'conversations_' + userId;
            const convs = JSON.parse(localStorage.getItem(convsKey) || '[]');
            const existing = convs.find(c => c.id === convId);
            const lastText = String(text).slice(0, 140);
            if (existing) {
                existing.last = lastText;
                existing.updated = now;
                // Only mark as unread if it's an admin/user reply (not a user sending)
                // Admin replies should NOT create unread for user (admin uses different system)
                if (sender === 'user') existing.unread = 0;
            } else {
                convs.unshift({ id: convId, agent: 'Agent', last: lastText, unread: 0, updated: now });
            }
            localStorage.setItem(convsKey, JSON.stringify(convs));
            // also set a small signal key so other tabs re-render lists reliably
            try { localStorage.setItem('wispaMessageSignal_' + userId, String(now)); } catch(e) {}
        } catch (e) {}

        // Track unread messages for ADMIN on property chats
        if (convId.startsWith('property-') && sender === 'user') {
            try {
                const adminUnreadKey = 'adminUnread';
                const adminUnread = JSON.parse(localStorage.getItem(adminUnreadKey) || '{}');
                const chatId = 'property-' + convId.replace('property-', '') + '-' + userId;
                adminUnread[chatId] = (adminUnread[chatId] || 0) + 1;
                localStorage.setItem(adminUnreadKey, JSON.stringify(adminUnread));
            } catch (e) {}
        }

        // Save a lightweight backup of the conversation (per-conversation backup key)
        try {
            localStorage.setItem(key + '_backup', JSON.stringify(list));
        } catch(e) {}
    };

    window.subscribeConversation = function(convId, callback) {
        if (!_convSubscribers[convId]) _convSubscribers[convId] = [];
        _convSubscribers[convId].push(callback);
        return () => { // unsubscribe
            _convSubscribers[convId] = _convSubscribers[convId].filter(c => c !== callback);
        };
    };

    // Listen for storage events so different tabs/windows update in real-time
    window.addEventListener('storage', function(e){
        if (!e.key || !e.key.startsWith('wispaMessages_')) return;
        const convId = e.key.replace(/^wispaMessages_[^_]*_/, '').replace(/^wispaMessages_/, ''); // Extract convId handling both old and new formats
        const list = window.getConversationMessages(convId);
        if (_convSubscribers[convId]) {
            _convSubscribers[convId].forEach(cb => { try { cb(list); } catch(e){} });
        }
    });

    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', () => {
            const text = chatInput && chatInput.value ? chatInput.value.trim() : '';
            if (text) {
                sendMessage(text);
                if (chatInput) chatInput.value = '';
            }
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && sendChatBtn) {
                sendChatBtn.click();
            }
        });
    }

    // Search functionality
    if (searchBtn) searchBtn.addEventListener('click', filterProperties);
    if (searchInput) {
        searchInput.addEventListener('keyup', function(event) {
            if (event.key === 'Enter') {
                filterProperties();
            }
        });
    }

    // Category filtering
    categoryLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            categoryLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            currentPage = 1; // Reset to first page
            filterProperties();
        });
    });

    // Apply filters
    // applyFiltersBtn.addEventListener('click', filterProperties);

    // Clear filters
    // document.getElementById('clear-filters').addEventListener('click', () => {
    //     document.getElementById('price-min').value = '';
    //     document.getElementById('price-max').value = '';
    //     document.getElementById('bedrooms').value = '';
    //     document.getElementById('location').value = '';
    //     document.getElementById('sort').value = 'date';
    //     currentPage = 1; // Reset pagination
    //     filterProperties();
    // });

    // Quick search functionality - wrap in DOMContentLoaded to ensure form is ready
    document.addEventListener('DOMContentLoaded', () => {
        const quickSearchForm = document.getElementById('quick-search-form');
        if (quickSearchForm) {
            quickSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const propertyType = document.getElementById('quick-type').value;
                const propertyStatus = document.getElementById('quick-status').value;
                const location = document.getElementById('quick-location').value;
                const minPrice = document.getElementById('quick-min-price').value;
                const maxPrice = document.getElementById('quick-max-price').value;

                console.log('Filter values:', { propertyType, propertyStatus, location, minPrice, maxPrice });
                console.log('Total properties:', properties.length);

                // Filter properties based on form inputs
                let filtered = properties.filter(property => {
                    let typeMatch = true;
                    let statusMatch = true;
                    let locationMatch = true;
                    let priceMatch = true;

                    // Handle property type filtering
                    if (propertyType !== '') {
                        const titleLower = property.title.toLowerCase();
                        switch(propertyType) {
                            case 'lands':
                                typeMatch = titleLower.includes('land');
                                break;
                            case 'apartment':
                                typeMatch = (titleLower.includes('apartment') || titleLower.includes('condo') || titleLower.includes('penthouse'));
                                break;
                            case 'houses':
                                typeMatch = (titleLower.includes('house') || titleLower.includes('villa') || titleLower.includes('townhouse') || titleLower.includes('bungalow') || titleLower.includes('cottage'));
                                break;
                            case 'offices':
                                typeMatch = (titleLower.includes('office') || titleLower.includes('commercial'));
                                break;
                            default:
                                typeMatch = true;
                        }
                    }

                    // Handle sale/rent status filtering
                    if (propertyStatus !== '') {
                        statusMatch = property.type === propertyStatus;
                    }

                    // Handle location filtering
                    if (location !== '' && location !== 'all') {
                        locationMatch = property.location.toLowerCase().includes(location.toLowerCase());
                    }

                    // Handle price filtering
                    if (minPrice !== '') {
                        priceMatch = priceMatch && property.price >= parseInt(minPrice);
                    }
                    if (maxPrice !== '') {
                        priceMatch = priceMatch && property.price <= parseInt(maxPrice);
                    }

                    return typeMatch && statusMatch && locationMatch && priceMatch;
                });
                
                console.log('Filtered results:', filtered.length);
                filteredProperties = filtered;
                currentPage = 1; // Reset to first page
                renderProperties(filteredProperties);
                
                // Scroll to results
                const filteredSection = document.getElementById('filtered-results-section');
                if (filteredSection) {
                    filteredSection.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }

        // Populate countries in location datalist
        const countriesList = document.getElementById('countries-list');
        if (countriesList) {
            countries.forEach(country => {
                const option = document.createElement('option');
                option.value = country;
                countriesList.appendChild(option);
            });
        }

        // Header search bar functionality
        const headerSearchForm = document.getElementById('header-search-form');
        if (headerSearchForm) {
            headerSearchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const searchQuery = document.getElementById('header-search-input').value.trim();
                
                if (searchQuery === '') {
                    alert('Please enter a search term');
                    return;
                }
                
                console.log('Header search query:', searchQuery);

                // Filter properties based on search query
                let filtered = properties.filter(property => {
                    const query = searchQuery.toLowerCase();
                    
                    // Search in title, location, and type
                    return (
                        property.title.toLowerCase().includes(query) ||
                        property.location.toLowerCase().includes(query) ||
                        property.type.toLowerCase().includes(query)
                    );
                });

                console.log('Search results:', filtered.length, 'properties found');
                
                // Update the filtered properties and render
                filteredProperties = filtered;
                currentPage = 1; // Reset to first page
                renderProperties(filteredProperties);
                
                // Clear the search input
                document.getElementById('header-search-input').value = '';
                
                // Scroll to results
                const filteredSection = document.getElementById('filtered-results-section');
                if (filteredSection) {
                    filteredSection.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    });

    // Load more properties
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            renderProperties(filteredProperties, true); // Append mode
        });
    }

    // Testimonials slider (simple auto-scroll)
    const testimonialSlider = document.querySelector('.testimonial-slider');
    if (testimonialSlider) {
        setInterval(() => {
            testimonialSlider.scrollBy({ left: 320, behavior: 'smooth' });
            if (testimonialSlider.scrollLeft + testimonialSlider.clientWidth >= testimonialSlider.scrollWidth) {
                testimonialSlider.scrollTo({ left: 0, behavior: 'smooth' });
            }
        }, 5000);
    }

    // CTA button
    const ctaBtn = document.querySelector('.cta .btn');
    if (ctaBtn) {
        ctaBtn.addEventListener('click', () => {
            document.getElementById('post-ad-modal').style.display = 'block';
        });
    }

    // Update data loading functions to use API endpoints
    function loadProperties() {
        // Prefer server state: try API first, then fall back to localStorage when offline
        const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
        return poster('/api/properties')
            .then(resp => {
                if (!resp || (resp.ok === false && typeof resp.json !== 'function')) throw new Error('API fetch failed');
                // If using native fetch, resp may be a Response; otherwise apiFetch returns parsed json
                if (typeof resp.json === 'function') return resp.json();
                return resp;
            })
            .then(data => {
                properties = Array.isArray(data.properties) ? data.properties : [];
                // Normalize backend fields to frontend shape so images and post status display correctly
                properties = properties.map(p => {
                    const prop = Object.assign({}, p);
                    if (prop.image_url && !prop.image) prop.image = prop.image_url;
                    if (prop.image_url && (!prop.images || !Array.isArray(prop.images) || prop.images.length === 0)) prop.images = [prop.image_url];
                    // map DB snake_case to frontend camelCase for post status
                    if (prop.post_to && !prop.postTo) prop.postTo = prop.post_to;
                    if (prop.postTo) {
                        prop.featured = prop.postTo === 'featured';
                        prop.hot = prop.postTo === 'hot';
                    }
                    // Ensure numeric price
                    if (prop.price && typeof prop.price === 'string') {
                        const num = Number(prop.price);
                        if (!Number.isNaN(num)) prop.price = num;
                    }
                    return prop;
                });
                filteredProperties = [...properties];
                try { localStorage.setItem('properties', JSON.stringify(properties)); } catch (e) {}
                renderProperties(filteredProperties);
                return properties;
            })
            .catch(err => {
                // Fallback to localStorage for offline/editor use
                try {
                    const stored = localStorage.getItem('properties');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed)) {
                            properties = parsed;
                            filteredProperties = [...properties];
                            renderProperties(filteredProperties);
                            return Promise.resolve(properties);
                        }
                    }
                } catch (e) { console.warn('loadProperties fallback failed', e); }
                console.warn('Failed to load properties from API, using empty list', err);
                properties = [];
                filteredProperties = [];
                renderProperties(filteredProperties);
                return Promise.resolve(properties);
            });
    }
    // Expose a stable reference to this loader so page-specific scripts cannot shadow it
    try{ window._globalLoadProperties = loadProperties; }catch(e){}

    async function saveProperty(property) {
        // Try saving to backend API first; attempt to upload any data: photos immediately
        try {
            // sanitize photo URLs: separate remote URLs from data-URLs and transient blob/file URLs
            const rawPhotos = Array.isArray(property.photoUrls) ? property.photoUrls : (property.photos || []);
            let remotePhotos = (rawPhotos || []).filter(p => typeof p === 'string' && (p.startsWith('http://') || p.startsWith('https://')));
            const dataPhotos = (rawPhotos || []).filter(p => typeof p === 'string' && p.startsWith('data:'));
            const transientPhotos = (rawPhotos || []).filter(p => typeof p === 'string' && (p.startsWith('blob:') || p.startsWith('file:') || p.startsWith('filesystem:')));

            // If there are data: photos (base64) try to upload them to the server now so
            // the saved property contains remote URLs. If upload fails, fall back to
            // saving them locally (localPhotos_<key>) and mark the property for background migration.
            if (dataPhotos.length) {
                try {
                    const blobs = dataPhotos.map(d => dataURLToBlob(d)).filter(Boolean);
                    if (blobs.length) {
                        const form = new FormData();
                        blobs.forEach((b, idx) => {
                            let ext = 'bin';
                            try { if (b && b.type) { const parts = b.type.split('/'); if (parts[1]) ext = parts[1].split('+')[0]; } } catch (e) {}
                            const name = `file-${Date.now()}-${idx}.${ext}`;
                            form.append('files', b, name);
                        });
                        const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
                        const resp = await poster('/api/upload-photos', { method: 'POST', body: form });
                        if (resp && typeof resp.json === 'function' && resp.ok) {
                            const j = await resp.json();
                            const urls = Array.isArray(j.urls) ? j.urls : (j && j.uploaded ? j.uploaded : []);
                            if (urls && urls.length) {
                                remotePhotos = remotePhotos.concat(urls);
                                property.images = property.photoUrls = property.photos = remotePhotos;
                            }
                        } else if (resp && !resp.ok) {
                            throw new Error('upload failed');
                        }
                    }
                } catch (uploadErr) {
                    try {
                        const key = 'localPhotos_' + (property.id || ('tmp-' + Date.now()));
                        localStorage.setItem(key, JSON.stringify(dataPhotos));
                        property._localPhotosKey = key;
                        console.warn('Saved data-URL photos locally under', key, uploadErr);
                    } catch (e) { console.warn('Failed to save local photos', e); }
                }
            }

            // Build body only with remote (http/https) photo URLs
            const body = { property: property, photoUrls: remotePhotos };
            const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;

            try {
                const response = await poster('/api/properties', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!response) throw new Error('No response from API');
                if (typeof response.json === 'function') {
                    if (!response.ok) throw new Error('API save failed');
                    await response.json();
                }
                // After a successful save, send notifications (user + admin), refresh server state so all devices sync
                try {
                    // Notify the posting user (best-effort)
                    (async function(){
                        try{
                            const u = (typeof window !== 'undefined' && window.getCurrentUser) ? await window.getCurrentUser() : null;
                            const poster2 = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
                            const notif = {
                                title: 'Your property was posted',
                                message: `Your property "${property.title || property.location || 'Listing'}" was successfully created.`,
                                timestamp: new Date().toISOString(),
                                data: { propertyId: property.id || null }
                            };
                            if(u && u.id){
                                try{
                                    await poster2('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: u.id, notification: notif }) });
                                }catch(e){
                                    // fallback: save to local notifications for this user so UI can show it
                                    try{
                                        const key = 'notifications_' + u.id;
                                        const arr = JSON.parse(localStorage.getItem(key) || '[]');
                                        arr.unshift(Object.assign({}, notif, { read: false }));
                                        localStorage.setItem(key, JSON.stringify(arr));
                                        try{ localStorage.setItem('wispaMessageSignal_' + u.id, String(Date.now())); }catch(e){}
                                    }catch(e){}
                                }
                            }
                        }catch(e){}
                    })();

                    // Notify admins (best-effort). If unauthorized or offline, queue into 'pendingNotifications'
                    (async function(){
                        try{
                            const poster2 = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
                            const title = 'New property created';
                            const body = `A new property was posted: ${property.title || property.location || 'Listing'}`;
                            try{
                                const resp = await poster2('/api/admin/sent-notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title, body: body, data: { property: property } }) });
                                if(!resp || !resp.ok){
                                    throw new Error('admin notify failed');
                                }
                            }catch(e){
                                try{
                                    const key = 'pendingNotifications';
                                    const pending = JSON.parse(localStorage.getItem(key) || '[]');
                                    pending.push({ title: title, body: body, data: { property: property }, attempts: 0, ts: Date.now() });
                                    localStorage.setItem(key, JSON.stringify(pending));
                                }catch(e){}
                            }
                        }catch(e){}
                    })();
                } catch(e){}

                try { await loadProperties(); } catch (e) { /* ignore */ }
                return property;
            } catch (err) {
                console.warn('saveProperty API failed, falling back to localStorage', err);
                try {
                    if (!Array.isArray(properties)) {
                        console.warn('properties was not an array in saveProperty.catch; resetting to []', properties);
                        properties = [];
                    }
                    properties.push(property);
                } catch (e) { console.error('Failed to push property to local properties array', e, properties); }
                try { localStorage.setItem('properties', JSON.stringify(properties)); } catch (e) {}
                return Promise.resolve(property);
            }
        } catch (e) {
            // Fallback to localStorage
            try {
                if (!Array.isArray(properties)) {
                    console.warn('properties was not an array in saveProperty.fallback; resetting to []', properties);
                    properties = [];
                }
                properties.push(property);
            } catch (errPush) { console.error('Failed to push property to local properties array (fallback)', errPush, properties); }
            try { localStorage.setItem('properties', JSON.stringify(properties)); } catch (e) {}
            return Promise.resolve(property);
        }
    }

    // Refresh properties from server when tab/window gains focus so different devices converge
    window.addEventListener('focus', () => {
        try { loadProperties(); } catch(e) {}
    });

    function loadLikedProperties() {
        // Try to load from localStorage first
        try {
            const stored = localStorage.getItem('likedProperties');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    return Promise.resolve(parsed);
                }
            }
        } catch (e) {
            console.warn('Failed to parse stored likedProperties', e);
        }
        // Prefer server API when available
        try {
            const fetcher = window.apiFetch ? window.apiFetch : fetch;
            return fetcher('/api/user/liked-properties')
                .then(r => r.ok ? r.json() : Promise.reject())
                .then(data => Array.isArray(data.liked) ? data.liked : [])
                .catch(() => Promise.resolve([]));
        } catch (e) {
            return Promise.resolve([]);
        }
    }

    function loadNotifications(userId) {
        // Try to load from localStorage first
        try {
            const stored = localStorage.getItem('notifications_' + userId);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    return Promise.resolve(parsed);
                }
            }
        } catch (e) {
            console.warn('Failed to parse stored notifications', e);
        }
        try {
            const fetcher = window.apiFetch ? window.apiFetch : fetch;
            return fetcher('/api/notifications?userId=' + encodeURIComponent(userId))
                .then(r => r.ok ? r.json() : Promise.reject())
                .then(data => Array.isArray(data.notifications) ? data.notifications : (data.notifications || []))
                .catch(() => {
                    try { const stored = JSON.parse(localStorage.getItem('notifications_' + userId) || '[]'); return stored; } catch(e){ return []; }
                });
        } catch (e) {
            try { const stored = JSON.parse(localStorage.getItem('notifications_' + userId) || '[]'); return Promise.resolve(stored); } catch(err){ return Promise.resolve([]); }
        }
    }

    function loadConversations(userId) {
        // Try to load from localStorage first
        try {
            const stored = localStorage.getItem('conversations_' + userId);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    return Promise.resolve(parsed);
                }
            }
        } catch (e) {
            console.warn('Failed to parse stored conversations', e);
        }
        try {
            const fetcher = window.apiFetch ? window.apiFetch : fetch;
            return fetcher('/api/conversations?userId=' + encodeURIComponent(userId))
                .then(r => r.ok ? r.json() : Promise.reject())
                .then(data => Array.isArray(data.conversations) ? data.conversations : (data.conversations || []))
                .catch(() => {
                    try { const stored = JSON.parse(localStorage.getItem('conversations_' + userId) || '[]'); return stored; } catch(e){ return []; }
                });
        } catch (e) {
            try { const stored = JSON.parse(localStorage.getItem('conversations_' + userId) || '[]'); return Promise.resolve(stored); } catch(err){ return Promise.resolve([]); }
        }
    }

    function renderChatMessages(messages) {
        chatMessages.innerHTML = '';
        messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            const text = msg.body || msg.content || msg.text || (msg.meta && msg.meta.text) || JSON.stringify(msg);
            const ts = msg.sent_at || msg.ts || msg.timestamp || msg.sentAt || new Date().toISOString();
            msgDiv.textContent = `${ts}: ${text}`;
            chatMessages.appendChild(msgDiv);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    function loadChatMessages(convId) {
        // convId optional: try to infer from current property or support
        let cid = convId || (window.__currentProperty ? ('property-' + window.__currentProperty.id) : null);
        // fallback to support queue per user
        if (!cid) {
            const uid = _getUserId();
            cid = uid ? ('support-' + uid) : 'support-guest';
        }
        try {
            const fetcher = window.apiFetch ? window.apiFetch : fetch;
            return fetcher('/api/conversations/' + encodeURIComponent(cid) + '/messages')
                .then(r => r.ok ? r.json() : Promise.reject())
                .then(data => {
                    const msgs = Array.isArray(data.messages) ? data.messages : (data.messages || []);
                    renderChatMessages(msgs);
                    return msgs;
                })
                .catch(() => {
                    const msgs = JSON.parse(localStorage.getItem('chatMessages') || '[]');
                    renderChatMessages(msgs);
                    return msgs;
                });
        } catch (e) {
            const msgs = JSON.parse(localStorage.getItem('chatMessages') || '[]');
            renderChatMessages(msgs);
            return Promise.resolve(msgs);
        }
    }

    function sendChatMessage(text) {
        let cid = (window.__currentProperty ? ('property-' + window.__currentProperty.id) : null);
        if (!cid) {
            const uid = _getUserId();
            cid = uid ? ('support-' + uid) : 'support-guest';
        }
        const msg = { sender: 'user', text: String(text), ts: Date.now(), userId: _getUserId() };
        try {
            const poster = window.apiFetch ? window.apiFetch : (url => fetch(url));
            return poster('/api/conversations/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ convId: cid, message: msg }) })
                .then(r => r.ok ? r.json() : Promise.reject())
                .then(() => loadChatMessages(cid))
                .catch(() => {
                    // fallback to localStorage
                    const messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
                    messages.push({ text: text, timestamp: new Date().toLocaleString() });
                    localStorage.setItem('chatMessages', JSON.stringify(messages));
                    loadChatMessages(cid);
                });
        } catch (e) {
            const messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
            messages.push({ text: text, timestamp: new Date().toLocaleString() });
            localStorage.setItem('chatMessages', JSON.stringify(messages));
            return loadChatMessages(cid);
        }
    }

    // Update existing functions to use new API-ready functions
    // In postAdForm submit:
    // Replace: properties.push(newProperty);
    // With: saveProperty(newProperty).then(() => renderProperties(filteredProperties));

    // In like button click:
    // Replace: localStorage.setItem('likedProperties', JSON.stringify(liked));
    // With: saveLikedProperties(liked);

    // In load liked state:
    // Replace: const liked = JSON.parse(localStorage.getItem('likedProperties') || '[]');
    // With: loadLikedProperties().then(liked => { ... });

    // In sendChatBtn click:
    // Replace: sendMessage(text);
    // With: sendChatMessage(text);

document.addEventListener('DOMContentLoaded', () => {
    // Initialize property list element
    propertyList = document.getElementById('property-list');
    
    // Hide property sections initially (will be shown if properties exist)
    const hotSection = document.getElementById('hot-properties-section');
    const featuredSection = document.getElementById('featured-section');
    const listingsSection = document.getElementById('listings-section');
    if (hotSection) hotSection.style.display = 'none';
    if (featuredSection) featuredSection.style.display = 'none';
    if (listingsSection) listingsSection.style.display = 'none';
    
    // Initial load — call the stable loader reference to avoid page overrides
    (window._globalLoadProperties || loadProperties)().then((loadedProperties) => {
        properties = loadedProperties;
        filteredProperties = Array.isArray(properties) ? [...properties] : [];
        // Render main homepage sections — do NOT show the filtered "Search Results" section by default.
        if (document.getElementById('hot-properties-section')) renderHotProperties();
        renderFeaturedProperties();
        // Render available listings into the Available section (not the search results)
        renderAvailableProperties();
        const filteredSection = document.getElementById('filtered-results-section');
        if (filteredSection) filteredSection.style.display = 'none';
    });
});

// Add scroll controls to hot/featured rows (injected buttons)
function initHotScrollControls() {
    document.querySelectorAll('.carousel-wrapper').forEach(wrapper => {
        // avoid duplicating controls
        // Only add a right scroll button (remove left button per request)
        if (wrapper.querySelector('.hot-scroll-btn.right')) return;
        const right = document.createElement('button');
        right.className = 'hot-scroll-btn right';
        right.setAttribute('aria-label', 'Scroll right');
        right.innerHTML = '▶';

        const row = wrapper.querySelector('.hot-row');
        if (!row) return;

        right.addEventListener('click', () => {
            row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' });
        });

        wrapper.appendChild(right);
    });
}

// Re-init controls after rendering hot/featured lists
const originalRenderHot = typeof renderHotProperties === 'function' ? renderHotProperties : null;
if (originalRenderHot) {
    const wrappedHot = function() {
        originalRenderHot();
        initHotScrollControls();
    };
    window.renderHotProperties = wrappedHot;
}

const originalRenderFeatured = typeof renderFeaturedProperties === 'function' ? renderFeaturedProperties : null;
if (originalRenderFeatured) {
    const wrappedFeatured = function() {
        originalRenderFeatured();
        initHotScrollControls();
    };
    window.renderFeaturedProperties = wrappedFeatured;
}

// Keep the homepage in sync when the admin panel (other tab) updates properties in localStorage
window.addEventListener('storage', (e) => {
    if (e.key === 'properties') {
        try {
            const parsed = JSON.parse(e.newValue || '[]');
            properties = Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            properties = [];
        }
        filteredProperties = [...properties];
        if (document.getElementById('hot-properties-section')) renderHotProperties();
        renderFeaturedProperties();
        // Update available list instead of showing search results
        renderAvailableProperties();
        const filteredSection = document.getElementById('filtered-results-section');
        if (filteredSection) filteredSection.style.display = 'none';
    }
});

// Hamburger menu functionality consolidated in the IIFE below



// Hamburger menu — single robust handler
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('hamburgerMenuContainer');
  if (!container) return;
  const btn = container.querySelector('.hamburger-btn');
  const dropdown = container.querySelector('.hamburger-dropdown');
  if (!btn || !dropdown) return;

  // ensure ARIA defaults
  dropdown.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Toggle visual state
        dropdown.classList.toggle('show');
        const isOpen = dropdown.classList.contains('show');
        dropdown.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        // animate button (rotate) by toggling active class
        btn.classList.toggle('active', isOpen);
    });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdown.classList.remove('show');
      dropdown.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      dropdown.style.display = '';
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.remove('show');
      dropdown.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      dropdown.style.display = '';
    }
  });

    // Optional: hook menu items (links/buttons) and handle button actions
    container.querySelectorAll('.hamburger-dropdown a, .hamburger-dropdown button').forEach(item => {
        item.addEventListener('click', (e) => {
            try {
                    if (item.tagName === 'BUTTON') {
                    if (item.classList.contains('chat-btn')) {
                        window.location.href = 'chat.html';
                    } else if (item.classList.contains('wallet-btn')) {
                        window.location.href = 'wallet.html';
                    } else if (item.classList.contains('post-ad-btn')) {
                        const modal = document.getElementById('post-ad-modal');
                        if (modal) modal.style.display = 'block';
                    }
                }
            } catch (err) {
                console.warn('Error handling menu item action', err);
            }

            // close after action; anchors will navigate naturally
            dropdown.classList.remove('show');
            dropdown.setAttribute('aria-hidden', 'true');
            btn.setAttribute('aria-expanded', 'false');
            dropdown.style.display = '';
        });
    });
});

// Populate #quick-location with all countries (single placeholder, no duplicates)
(function populateLocationDropdown(){
    const quickLocation = document.getElementById('quick-location');

    if (quickLocation) {
        if (quickLocation.tagName === 'SELECT') {
            // Reset to exactly one placeholder option
            quickLocation.innerHTML = '<option value="">Location</option>';
            // Append all countries from the `countries` array
            countries.forEach(country => {
                const opt = document.createElement('option');
                opt.value = country;
                opt.textContent = country;
                quickLocation.appendChild(opt);
            });
        } else if (quickLocation.tagName === 'INPUT') {
            // Populate a datalist so the dropdown width matches the input
            let list = document.getElementById('countries-list');
            if (!list) {
                list = document.createElement('datalist');
                list.id = 'countries-list';
                quickLocation.insertAdjacentElement('afterend', list);
            }
            list.innerHTML = '';
            countries.forEach(country => {
                const opt = document.createElement('option');
                opt.value = country;
                list.appendChild(opt);
            });
        }
    }

    // Also populate any standalone datalist with id 'countries-list' (for pages using `id="location"`)
    const standaloneList = document.getElementById('countries-list');
    if (standaloneList) {
        standaloneList.innerHTML = '';
        countries.forEach(country => {
            const opt = document.createElement('option');
            opt.value = country;
            standaloneList.appendChild(opt);
        });
    }
})();

// Remove hard-coded demo property cards from index.html so dynamic data is used
document.addEventListener('DOMContentLoaded', function(){
    try{
        const path = (location && location.pathname) ? location.pathname : '';
        if (!path || path.endsWith('/') || path.endsWith('index.html') || path.indexOf('index') !== -1) {
            ['hot-row-1','hot-row-2','featured-list','available-list'].forEach(id => {
                try{ const el = document.getElementById(id); if(el) el.innerHTML = '<!-- dynamic content loaded by script.js -->'; }catch(e){}
            });
        }
    }catch(e){}
});