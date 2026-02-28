// Minimal Admin Chat Widget
(function(){
  class AdminChatWidget {
    constructor(opts){
      this.listEl = document.getElementById(opts.listId);
      this.fullView = document.getElementById(opts.fullViewId);
      this.messagesEl = document.getElementById(opts.messagesId);
      this.inputEl = document.getElementById(opts.inputId);
      this.sendBtn = document.getElementById(opts.sendBtnId);
      this.currentConv = null;
      this.pollTimer = null;
      this.sending = false;
      this.searchEl = document.getElementById(opts.searchId || 'chatSearchInput');
      this.init();
    }

    init(){
      if(this.sendBtn){
        this.sendBtn.addEventListener('click', ()=> this.sendMessage());
      }
      // back button
      const back = document.getElementById('chat-back');
      if(back) back.addEventListener('click', ()=> this.closeConversation());
      // load list
      try{ this.loadConversations(); }catch(e){ this.showError('Failed to initialize chat list', e); }
    }

    async apiGet(path){
      try{ const r = window.apiFetch ? await window.apiFetch(path) : await fetch(path); return r && r.ok ? await r.json() : null; }catch(e){ return null; }
    }

    async apiPost(path, body){
      try{
        const r = window.apiFetch ? await window.apiFetch(path, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }) : await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        if(!r) return null;
        if(r.ok){ try{ return await r.json(); }catch(e){ return {}; } }
        // non-OK response: try to provide useful info
        try{ const txt = await r.text(); let parsed = null; try{ parsed = JSON.parse(txt); }catch(e){}; return { _error: true, status: r.status, body: parsed || txt }; }catch(e){ return { _error: true, status: r.status }; }
      }catch(e){ return { _error: true, error: String(e && e.message ? e.message : e) }; }
    }

    async loadConversations(){
      try{
        // Ensure full conversation view is closed when rendering the list
        try{ if(this.fullView) this.fullView.style.display = 'none'; if(this.listEl) this.listEl.style.display = 'block'; this.currentConv = null; }catch(e){}
        this.listEl.innerHTML = 'Loading...';
        const j = await this.apiGet('/api/conversations');
        const convs = Array.isArray(j && j.conversations ? j.conversations : j) ? (j.conversations || j) : [];
        this.convs = convs || [];
        if(!this.convs || !this.convs.length) { this.listEl.innerHTML = 'No conversations.'; return; }
        this.renderConversations();
        // wire search input if present
        try{
          if(this.searchEl){
            this.searchEl.addEventListener('input', ()=> this.renderConversations());
            this.searchEl.addEventListener('change', ()=> this.renderConversations());
          }
        }catch(e){}
      }catch(e){
        try{ if(this.listEl) this.listEl.innerHTML = 'Failed to load conversations.'; }catch(_){ }
        this.showError('Failed to load conversations', e);
      }
    }

    renderConversations(){
      const q = (this.searchEl && this.searchEl.value) ? String(this.searchEl.value).toLowerCase().trim() : '';
      const rows = this.convs.filter(c=>{
        if(!q) return true;
        const id = String(c.id || c.conversation_id || c.key || '').toLowerCase();
        const name = String(c.participantName || c.userName || c.userNameDisplay || '').toLowerCase();
        const email = String(c.userEmail || c.participantEmail || '').toLowerCase();
        const combined = id + ' ' + name + ' ' + email + ' ' + JSON.stringify(c).toLowerCase();
        return combined.indexOf(q) !== -1;
      });
      if(!rows.length){ this.listEl.innerHTML = '<div style="color:#666;padding:8px">No conversations found.</div>'; return; }
      const ul = document.createElement('div'); ul.style.display = 'flex'; ul.style.flexDirection = 'column'; ul.style.gap='8px';
      rows.forEach(c => {
        const id = c.id || c.conversation_id || c.key || '';
        // participant (user) should be the primary left label
        const participant = c.participantName || c.userName || c.userNameDisplay || c.participantEmail || '';
        // property title/id should be shown on the right
        const propTitle = (c.property && (c.property.title || c.property.name)) || (c.meta && c.meta.property && (c.meta.property.title || c.meta.property.name)) || '';
        const propId = (c.property && (c.property.id || c.property.propertyId)) || c.propertyId || (c.meta && c.meta.property && (c.meta.property.id || c.meta.property.propertyId)) || '';
        const last = c.last || c.updated || '';
        // fallback title (if no participant) show formatted property id or raw id
        let leftTitle = participant || '';
        if(!leftTitle){
          if(id && String(id).toLowerCase().startsWith('property-')){
            const parts = String(id).split('-');
            leftTitle = 'Property #' + (parts[1] || id);
          } else {
            leftTitle = id || propTitle || 'Conversation';
          }
        }
        // try to find avatar url in common places
        const avatar = c.avatar || c.userAvatar || c.participantAvatar || (c.user && (c.user.avatar || c.user.photo)) || (c.meta && c.meta.user && (c.meta.user.avatar || c.meta.user.photo)) || '';
        const avatarUrl = avatar ? (typeof normalizeImageUrl === 'function' ? normalizeImageUrl(avatar) : avatar) : '';
        const row = document.createElement('div');
        row.style.padding='8px'; row.style.border='1px solid var(--border)'; row.style.borderRadius='8px'; row.style.cursor='pointer';
        row.innerHTML = `
          <div style="display:flex;gap:12px;align-items:center">
            <div style="flex:0 0 auto">
              ${avatarUrl ? `<img src="${this.escape(avatarUrl)}" alt="avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--border)">` : `<div style="width:40px;height:40px;border-radius:50%;background:#f0f3f6;border:1px solid var(--border);"></div>`}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.escape(leftTitle)}</div>
              <div style="color:#666;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.escape(String(last))}</div>
            </div>
            <div style="flex:0 0 220px;text-align:right;min-width:120px">
              <div style="font-size:13px;color:#444">${participant?this.escape(participant):''}</div>
              ${propTitle || propId ? `<div style="margin-top:6px;font-size:12px;color:#0e76a8">${propTitle?this.escape(propTitle):'Property'} ${propId?`(#${this.escape(String(propId))})`:''}</div>` : ''}
              <div style="margin-top:8px;font-size:12px;color:#666">
                <a href="admin.html#admin-conversation?id=${this.escape(String(id))}" style="color:var(--text);text-decoration:none">Open full page</a>
              </div>
            </div>
          </div>
        `;
        row.addEventListener('click', ()=> this.openConversation(id));
        ul.appendChild(row);
      });
      this.listEl.innerHTML=''; this.listEl.appendChild(ul);
    }

    escape(s){ try{ return String(s||''); }catch(e){ return ''; } }

    showStatus(msg, timeout){
      try{
        if(!this._statusEl){
          this._statusEl = document.createElement('div');
          this._statusEl.style.fontSize = '13px';
          this._statusEl.style.color = 'var(--secondary)';
          this._statusEl.style.margin = '6px 0';
          if(this.messagesEl && this.messagesEl.parentNode) this.messagesEl.parentNode.insertBefore(this._statusEl, this.messagesEl);
          else if(this.fullView) this.fullView.appendChild(this._statusEl);
        }
        this._statusEl.textContent = msg || '';
        if(timeout && timeout > 0){ setTimeout(()=>{ try{ if(this._statusEl) this._statusEl.textContent = ''; }catch(e){} }, timeout); }
      }catch(e){}
    }

    showError(message, err){
      try{
        const text = message + (err ? (': ' + (err && err.message ? err.message : String(err))) : '');
        console.warn('AdminChatWidget error:', message, err);
        if(!this._errorEl){
          this._errorEl = document.createElement('div');
          this._errorEl.style.background = '#fff6f6';
          this._errorEl.style.color = '#c33';
          this._errorEl.style.border = '1px solid #f5c6cb';
          this._errorEl.style.padding = '8px';
          this._errorEl.style.borderRadius = '6px';
          this._errorEl.style.margin = '8px 0';
          this._errorEl.style.fontSize = '13px';
          if(this.listEl && this.listEl.parentNode) this.listEl.parentNode.insertBefore(this._errorEl, this.listEl);
          else if(this.fullView && this.fullView.parentNode) this.fullView.parentNode.insertBefore(this._errorEl, this.fullView);
        }
        this._errorEl.textContent = text;
        // auto-clear after 8s
        setTimeout(()=>{ try{ if(this._errorEl) this._errorEl.textContent = ''; }catch(e){} }, 8000);
      }catch(e){ console.warn('showError failed', e); }
    }

    async openConversation(id){
      if(!id) return;
      this.currentConv = id;
      this.fullView.style.display = 'block';
      this.listEl.style.display = 'none';
      // Set global chat title and dataset so legacy handlers can work
      try{
        const titleEl = document.getElementById('chat-full-title');
        const subEl = document.getElementById('chat-full-sub');
        if(titleEl){ titleEl.dataset.chatId = id; }
        if(subEl) subEl.textContent = '';
      }catch(e){}
      this.messagesEl.innerHTML = 'Loading messages...';
      // stop any existing poll then start a new one after successful load
      this.stopPolling();
      try{ if(this.inputEl) { this.inputEl.disabled = false; } }catch(e){}
      try{
        const j = await this.apiGet('/api/conversations/' + encodeURIComponent(id) + '/messages');
        const msgs = Array.isArray(j && j.messages ? j.messages : j) ? (j.messages || j) : [];
        // If no server messages, try localStorage keys
        let merged = [];
        if(Array.isArray(msgs) && msgs.length) merged = msgs;
        else {
          try{
            const keys = ['adminMessages_'+id, 'wispaMessages_'+id];
            for(const k of keys){ const raw = localStorage.getItem(k); if(raw){ try{ const arr = JSON.parse(raw); if(Array.isArray(arr) && arr.length){ merged = merged.concat(arr); } }catch(e){} } }
          }catch(e){}
        }
        // Render property card if available
        let property = null;
        if(j && j.property) property = j.property;
        if(!property && merged && merged.length){ for(const m of merged){ if(m && m.meta && m.meta.property){ property = m.meta.property; break; } if(m && m.property){ property = m.property; break; } } }
        // render property card (match user conversation page presentation)
        if(property){
          try{ const titleEl = document.getElementById('chat-full-title'); const subEl = document.getElementById('chat-full-sub'); if(titleEl){ titleEl.textContent = property.title || property.name || titleEl.textContent || id; titleEl.dataset.chatId = id; } if(subEl){ subEl.textContent = property.location || property.address || ''; } }catch(e){}
          try{
            const p = property;
            const img = p.image || (p.images && p.images[0]) || '';
            const imgSrc = img ? (typeof normalizeImageUrl === 'function' ? normalizeImageUrl(img) : img) : '';
            const title = p.title || p.name || 'Property';
            const price = (p.price != null) ? (`€${Number(p.price).toLocaleString()}`) : '';
            const loc = p.location || p.address || '';
            const propId = p.id || p.propertyId || p.property_id || '';
            const badge = p.hot ? '🔥 Hot Property' : (p.featured ? '⭐ Featured Property' : '✅ Available Property');
            const beds = p.bedrooms || p.beds || p.bed || 0;
            const baths = p.bathrooms || p.baths || p.bath || 0;
            const typeLabel = (p.type === 'rent' || String(p.post_to||'').toLowerCase()==='rent') ? 'For Rent' : 'For Sale';
            const html = `
              <a href="property-detail.html?id=${this.escape(String(propId))}&conversation=true" style="text-decoration:none;color:inherit;display:block">
              <div id="messages-property-card" style="padding:12px;border-radius:8px;background:#f7fafd;margin-bottom:10px;display:flex;gap:18px;align-items:center;border:1px solid var(--border);max-width:900px;">
                  <div style="width:110px;height:80px;flex:0 0 110px;">
                      ${imgSrc ? `<img src="${this.escape(imgSrc)}" alt="${this.escape(title)}" style="width:110px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:#f7f7f7;">` : `<div style="width:110px;height:80px;border-radius:8px;background:#f7f7f7;border:1px solid var(--border);"></div>`}
                  </div>
                  <div style="flex:1;min-width:0">
                      <div style="font-weight:700;font-size:17px;line-height:1.2;">${this.escape(title)}</div>
                      <div style="display:flex;align-items:center;gap:10px;color:var(--secondary);font-size:14px;margin:2px 0 6px 0;">
                          <span>${this.escape(loc)}</span>
                          <span style='background:#3498db;color:#fff;font-size:12px;padding:2px 8px;border-radius:6px;'>${this.escape(badge)}</span>
                      </div>
                      <div style="display:flex;gap:16px;font-size:14px;color:#444;align-items:center;">
                          <span>${this.escape(price)}</span>
                          <span>${this.escape(String(beds))} bed</span>
                          <span>${this.escape(String(baths))} bath</span>
                          <span style="background:#eaf6ff;color:#3498db;padding:2px 8px;border-radius:6px;font-size:13px;">${this.escape(typeLabel)}</span>
                      </div>
                  </div>
              </div>
              </a>
            `;
            try{ const existing = document.getElementById('messages-property-card'); if(existing && existing.parentNode) existing.parentNode.removeChild(existing); }catch(e){}
            const temp = document.createElement('div'); temp.innerHTML = html; const node = temp.firstElementChild; if(this.messagesEl && this.messagesEl.parentNode) this.messagesEl.parentNode.insertBefore(node, this.messagesEl);
          }catch(e){ /* ignore property render errors */ }
        }

        if(!merged || !merged.length){
          try{ if(this.inputEl) this.inputEl.disabled = false; }catch(e){}
          if(this.messagesEl) this.messagesEl.innerHTML = '<div style="padding:12px;color:var(--text-light);">No messages yet.</div>';
          return;
        }
        merged.sort((a,b)=>{ const ta = new Date(a.timestamp||a.ts||a.time||0).getTime()||0; const tb = new Date(b.timestamp||b.ts||b.time||0).getTime()||0; return ta-tb; });
        const parts = merged.map(m => {
          const isAdmin = (m.sender === 'admin' || m.from === 'Admin');
          const label = isAdmin ? 'Admin' : (m.userName||m.userEmail||m.sender||'User');
          const ts = new Date(m.timestamp||m.ts||m.time||Date.now()).toLocaleString();
          const text = this.escape(m.text||m.body||m.content||'');
          return `<div style="display:flex;${isAdmin?'justify-content:flex-end':'justify-content:flex-start'};margin-bottom:8px;"><div style="max-width:75%;background:${isAdmin?'#3498db':'#fff'};color:${isAdmin?'#fff':'#222'};padding:10px;border-radius:10px;">`+
            `<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:${isAdmin?'#fff':'#666'};">${this.escape(label)}</div>`+
            `<div style="white-space:pre-wrap">${text}</div>`+
            `<div style="font-size:11px;color:rgba(0,0,0,0.45);margin-top:6px;text-align:${isAdmin?'right':'left'};">${this.escape(ts)}</div>`+
            `</div></div>`;
        });
        // Avoid replacing DOM if nothing changed to prevent focus/input jumping
        try{
          const lastMsg = merged.length ? (merged[merged.length-1].timestamp || merged[merged.length-1].ts || merged[merged.length-1].time || '') : '';
          const propId = property ? (property.id || property.propertyId || '') : '';
          const lastSig = String(lastMsg) + '|' + String(merged.length) + '|' + String(propId);
          if(this.messagesEl && this.messagesEl.dataset && this.messagesEl.dataset.lastSig === lastSig){
            // do nothing
          } else {
            if(this.messagesEl && this.messagesEl.dataset) this.messagesEl.dataset.lastSig = lastSig;
            if(this.messagesEl) this.messagesEl.innerHTML = parts.join('');
          }
        }catch(e){ if(this.messagesEl) this.messagesEl.innerHTML = parts.join(''); }
        try{ if(this.inputEl) { this.inputEl.disabled = false; /* don't force-focus to avoid jump — leave focus management to user */ } }catch(e){}
        // start polling to refresh messages periodically
        this.startPolling();
      }catch(e){
        try{ if(this.messagesEl) this.messagesEl.innerHTML = 'Failed to load messages.'; }catch(_){ }
        this.showError('Failed to load messages', e);
      }
    }

    startPolling(){
      try{ this.stopPolling(); if(!this.currentConv) return; this.pollTimer = setInterval(()=>{ try{ if(this.currentConv) this.openConversation(this.currentConv); }catch(e){} }, 8000); }catch(e){}
    }
    stopPolling(){ try{ if(this.pollTimer){ clearInterval(this.pollTimer); this.pollTimer = null; } }catch(e){}
    }

    closeConversation(){ this.fullView.style.display='none'; this.listEl.style.display='block'; }

    async sendMessage(){
      if(!this.currentConv){ try{ this.showError('No conversation open'); }catch(e){}; return; }
      const text = (this.inputEl && this.inputEl.value) ? String(this.inputEl.value).trim() : '';
      if(!text) return;
      if(this.sending) return;
      this.sending = true;
      if(this.sendBtn) this.sendBtn.disabled = true;
      if(this.inputEl) this.inputEl.disabled = true;
      try{
        // Primary per-conversation endpoint
        let resObj = await this.apiPost('/api/conversations/' + encodeURIComponent(this.currentConv) + '/messages', { text }).catch(err => ({ _error: true, error: String(err) }));
        if(resObj && !resObj._error){
          if(this.inputEl) this.inputEl.value = '';
          await this.openConversation(this.currentConv);
          this.showStatus('Sent', 1500);
          return;
        }

        // Fallback endpoint
        try{
          const poster = window.apiFetch ? window.apiFetch : fetch;
          const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ convId: this.currentConv, message: { sender: 'admin', text } }) };
          const r = await poster('/api/conversations/messages', opts).catch(()=>null);
          if(r && r.ok){
            if(this.inputEl) this.inputEl.value = '';
            await this.openConversation(this.currentConv);
            this.showStatus('Sent', 1500);
            return;
          }
          // Non-OK: surface body
          const txt = r && r.text ? await r.text().catch(()=>'') : '';
          let parsed = null; try{ parsed = JSON.parse(txt); }catch(e){}
          const info = parsed || txt || (r && r.status) || 'unknown';
          this.showError('send fallback failed', info);
        }catch(fbErr){
          this.showError('sendMessage fallback error', fbErr);
        }

        // If we reach here, sending didn't succeed
        this.showError('Send failed');
      }catch(err){
        this.showError('Send failed', err);
      }finally{
        this.sending = false;
        try{ if(this.sendBtn) this.sendBtn.disabled = false; if(this.inputEl) this.inputEl.disabled = false; }catch(e){}
      }
    }
  }

  window.AdminChatWidget = AdminChatWidget;
})();
