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
      this.loadConversations();
    }

    async apiGet(path){
      try{ const r = window.apiFetch ? await window.apiFetch(path) : await fetch(path); return r && r.ok ? await r.json() : null; }catch(e){ return null; }
    }

    async apiPost(path, body){
      try{ const r = window.apiFetch ? await window.apiFetch(path, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }) : await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }); return r && r.ok ? await r.json() : null; }catch(e){ return null; }
    }

    async loadConversations(){
      try{
        this.listEl.innerHTML = 'Loading...';
        const j = await this.apiGet('/api/conversations');
        const convs = Array.isArray(j && j.conversations ? j.conversations : j) ? (j.conversations || j) : [];
        if(!convs || !convs.length) { this.listEl.innerHTML = 'No conversations.'; return; }
        const ul = document.createElement('div');
        ul.style.display = 'flex'; ul.style.flexDirection = 'column'; ul.style.gap='8px';
        convs.forEach(c => {
          const id = c.id || c.conversation_id || c.key || '';
          const title = c.participantName || c.userName || (c.property && (c.property.title || c.property.name)) || id;
          const last = c.last || c.updated || '';
          const row = document.createElement('div');
          row.style.padding='8px'; row.style.border='1px solid var(--border)'; row.style.borderRadius='8px'; row.style.cursor='pointer';
          row.innerHTML = `<div style="font-weight:700">${this.escape(title)}</div><div style="color:#666;font-size:13px">${this.escape(String(last))}</div>`;
          row.addEventListener('click', ()=> this.openConversation(id));
          ul.appendChild(row);
        });
        this.listEl.innerHTML=''; this.listEl.appendChild(ul);
      }catch(e){ this.listEl.innerHTML = 'Failed to load conversations.'; }
    }

    escape(s){ try{ return String(s||''); }catch(e){ return ''; } }

    async openConversation(id){
      if(!id) return;
      this.currentConv = id;
      this.fullView.style.display = 'block';
      this.listEl.style.display = 'none';
      // Set global chat title and dataset so legacy handlers can work
      try{
        const titleEl = document.getElementById('chat-full-title');
        const subEl = document.getElementById('chat-full-sub');
        if(titleEl){ titleEl.textContent = id; titleEl.dataset.chatId = id; }
        if(subEl) subEl.textContent = '';
      }catch(e){}
      this.messagesEl.innerHTML = 'Loading messages...';
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
        // render property card
        if(property){
          try{ const titleEl = document.getElementById('chat-full-title'); const subEl = document.getElementById('chat-full-sub'); if(titleEl){ titleEl.textContent = property.title || property.name || titleEl.textContent || id; titleEl.dataset.chatId = id; } if(subEl){ subEl.textContent = property.location || property.address || ''; } }catch(e){}
          const cardHtml = `<div id="messages-property-card" style="padding:12px;border-radius:8px;background:#f7fafd;margin-bottom:10px;display:flex;gap:18px;align-items:center;border:1px solid var(--border);">
            <div style="flex:1"><div style="font-weight:700">${this.escape(property.title||property.name||'Property')}</div><div style="color:#666">${this.escape(property.location||property.address||'')}</div></div>
          </div>`;
          try{ const existing = document.getElementById('messages-property-card'); if(existing && existing.parentNode) existing.parentNode.removeChild(existing); }catch(e){}
          const temp = document.createElement('div'); temp.innerHTML = cardHtml; const node = temp.firstElementChild; if(this.messagesEl && this.messagesEl.parentNode) this.messagesEl.parentNode.insertBefore(node, this.messagesEl);
        }

        if(!merged || !merged.length){ this.messagesEl.innerHTML = '<div style="padding:12px;color:var(--text-light);">No messages yet.</div>'; try{ if(this.inputEl) this.inputEl.disabled = false; }catch(e){} return; }
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
        this.messagesEl.innerHTML = parts.join('');
        try{ if(this.inputEl) { this.inputEl.disabled = false; this.inputEl.focus(); } }catch(e){}
      }catch(e){ this.messagesEl.innerHTML = 'Failed to load messages.'; }
    }

    closeConversation(){ this.fullView.style.display='none'; this.listEl.style.display='block'; }

    async sendMessage(){
      if(!this.currentConv) return alert('No conversation open');
      const text = (this.inputEl && this.inputEl.value) ? String(this.inputEl.value).trim() : '';
      if(!text) return;
      try{
        const j = await this.apiPost('/api/conversations/' + encodeURIComponent(this.currentConv) + '/messages', { text });
        // add to view optimistically
        if(this.inputEl) this.inputEl.value = '';
        await this.openConversation(this.currentConv);
      }catch(e){ alert('Send failed'); }
    }
  }

  window.AdminChatWidget = AdminChatWidget;
})();
