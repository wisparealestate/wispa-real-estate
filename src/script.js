// Provide a site-wide API base and apiFetch helper so pages (property-detail, etc.)
// call the deployed backend when the frontend is served from a different origin.
window.WISPA_API_BASE = window.WISPA_API_BASE || 'https://wispa-real-estate-2ew3.onrender.com';
if (!window.apiFetch) {
    window.apiFetch = async function(url, opts) {
        const API_BASE = (window.WISPA_API_BASE || '').replace(/\/$/, '');
        try {
            // if no API_BASE configured, just use fetch
            if (!API_BASE) {
                return await fetch(url, opts);
            }
            // prefer calling configured backend directly for /api/ paths
            if (typeof url === 'string' && url.startsWith('/api/')) {
                return await fetch(API_BASE + url, opts);
            }
            // otherwise try same-origin then fallback to API_BASE
            try { const r = await fetch(url, opts); if (r && r.ok) return r; } catch(e){}
            return await fetch(API_BASE + url, opts);
        } catch (e) { return null; }
    };
}

// Server-backed storage shim: populate an in-memory cache from API and override localStorage
(async function(){
    const mapping = {
        properties: '/api/properties',
        adminChats: '/api/admin/messages',
        adminProfile: '/api/admin/profile',
        adminSentNotifications: '/api/admin/sent-notifications',
        propertyRequests: '/api/property-requests',
        contactMessages: '/api/contact-messages',
        notificationReactions: '/api/notification-reactions',
        systemAlerts: '/api/system-alerts',
        notifications: '/api/notifications',
        conversations: '/api/conversations',
        chatNotifications: '/api/admin/messages'
    };
    window._serverStorageCache = window._serverStorageCache || {};
    async function fetchKey(k){
        const url = mapping[k];
        if (!url) return null;
        try {
            const r = window.apiFetch ? await window.apiFetch(url) : await fetch((window.WISPA_API_BASE||'')+url);
            if (!r || !r.ok) return null;
            const j = await r.json();
            // prefer common wrapper keys
            const keys = ['properties','sent','profile','requests','contacts','reactions','alerts','notifications','conversations','messages','users'];
            for (const kk of keys) if (j[kk] !== undefined) return j[kk];
            // otherwise return whole body
            return j;
        } catch (e) { return null; }
    }
    // Fetch all mapped keys
    const keys = Object.keys(mapping);
    await Promise.all(keys.map(async k => {
        try { const v = await fetchKey(k); window._serverStorageCache[k] = v === null || v === undefined ? null : JSON.stringify(v); } catch(e){ window._serverStorageCache[k]=null; }
    }));

    // Override localStorage getItem/setItem to use in-memory cache and forward to server
    try {
        const origGet = localStorage.getItem.bind(localStorage);
        const origSet = localStorage.setItem.bind(localStorage);
        localStorage.getItem = function(key){
            if (window._serverStorageCache && key in window._serverStorageCache) return window._serverStorageCache[key];
            return origGet(key);
        };
        localStorage.setItem = function(key, value){
            if (window._serverStorageCache && key in window._serverStorageCache) {
                window._serverStorageCache[key] = value;
                // Avoid auto-forwarding the full `properties` array back to the POST /api/properties
                // endpoint — that was causing duplicate inserts when code stored the entire
                // properties list. Only forward other mapped keys (best-effort).
                if (key === 'properties') return;
                // try to forward to server (best-effort)
                try {
                    const parsed = JSON.parse(value);
                    // If mapped resource exists, POST to that endpoint
                    const url = mapping[key] || '/api/admin/sync';
                    const body = (url === '/api/admin/sync') ? { key, value: parsed } : parsed;
                    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
                    if (window.apiFetch) window.apiFetch(url, opts).catch(()=>{});
                    else fetch((window.WISPA_API_BASE||'') + url, opts).catch(()=>{});
                } catch(e){
                    // non-json value: still forward as sync wrapper
                    try {
                        const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) };
                        if (window.apiFetch) window.apiFetch('/api/admin/sync', opts).catch(()=>{});
                        else fetch((window.WISPA_API_BASE||'') + '/api/admin/sync', opts).catch(()=>{});
                    } catch(e){}
                }
                return;
            }
            return origSet(key, value);
        };
    } catch(e) { /* ignore shim failure */ }
})();


// Always sync window.properties from localStorage on page load
document.addEventListener('DOMContentLoaded', function() {
    window.properties = JSON.parse(localStorage.getItem('properties') || '[]');
});
// Render admin chat list in the chat tab

// Open chat conversation in fullview
function openAdminChat(chatId) {
    // Merge messages from all relevant keys
    let messages = [];
    let chat = null;
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
    for (let i = 0; i < keys.length; i++) {
        const arr = localStorage.getItem(keys[i]);
        if (arr) {
            try {
                const msgs = JSON.parse(arr);
                if (Array.isArray(msgs)) {
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
    // Get chat meta
    try {
        const adminChats = JSON.parse(localStorage.getItem('adminChats') || '[]');
        chat = adminChats.find(c => c.id === chatId);
    } catch(e){}
    if (!chat) {
        const chats = JSON.parse(localStorage.getItem('chatNotifications') || '[]');
        chat = chats.find(c => c.id === chatId);
    }
    if (!chat) return;
    document.getElementById('chat-fullview').style.display = 'block';
    document.getElementById('admin-chats-list').style.display = 'none';
    document.getElementById('chat-full-title').textContent = chat.userName || chat.conversationTitle || chat.participantName || chat.participantId;
    document.getElementById('chat-full-sub').textContent = chat.conversationTitle || chat.participantId || '';
    // Render messages
    const msgsEl = document.getElementById('chat-full-messages');
    if (!messages.length) {
        msgsEl.innerHTML = '<div style="padding:12px;color:var(--text-light);">No messages yet.</div>';
    } else {
        msgsEl.innerHTML = messages.map(m => `
            <div style="display:flex;${m.sender === 'admin' || m.from === 'Admin' ? 'justify-content:flex-end' : 'justify-content:flex-start'};margin-bottom:8px;">
                <div style="max-width:75%;background:${m.sender === 'admin' || m.from === 'Admin' ? '#3498db' : '#fff'};color:${m.sender === 'admin' || m.from === 'Admin' ? '#fff' : '#222'};padding:10px;border-radius:10px;box-shadow:var(--shadow);">
                    <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:${m.sender === 'admin' || m.from === 'Admin' ? '#fff' : '#666'};">${m.sender === 'admin' || m.from === 'Admin' ? 'Admin' : (m.userName || m.sender || m.from)}</div>
                    <div style="white-space:pre-wrap">${m.text}</div>
                    <div style="font-size:11px;color:rgba(0,0,0,0.45);margin-top:6px;text-align:${m.sender === 'admin' || m.from === 'Admin' ? 'right' : 'left'};">${new Date(m.timestamp || m.ts || m.time).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    }
    document.getElementById('chat-full-input').disabled = false;
}

function backToChatList() {
    document.getElementById('chat-fullview').style.display = 'none';
    document.getElementById('admin-chats-list').style.display = 'block';
}

// Render chat list when switching to chat tab
document.addEventListener('DOMContentLoaded', function() {
    const chatTab = document.getElementById('chat');
    if (chatTab && typeof renderAdminChatList === 'function') {
        renderAdminChatList();
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

function updateNavUnreadCounts(){
    try{
        const wispaUserRaw = localStorage.getItem('wispaUser');
        let userId = null;
        if(wispaUserRaw){
            try{ userId = JSON.parse(wispaUserRaw).id; }catch(e){}
        }

        // user notifications
        let notifCount = 0;
        if(userId){
            const notes = JSON.parse(localStorage.getItem('notifications_' + userId) || '[]');
            notifCount = notes.filter(n => !n.read).length;
        }

        // user chat unread (sum of conversation.unread)
        let chatCount = 0;
        if(userId){
            const convs = JSON.parse(localStorage.getItem('conversations_' + userId) || '[]');
            chatCount = convs.reduce((s,c) => s + (Number(c.unread) || 0), 0);
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
        const adminChatCount = (JSON.parse(localStorage.getItem('chatNotifications') || '[]')).filter(n => !n.read).length;

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
    let properties = [];

    // Initialize user-specific liked properties
    function initializeLikedProperties() {
        const wispaUser = localStorage.getItem('wispaUser');
        if (!wispaUser) return;
        
        const userData = JSON.parse(wispaUser);
        const userId = userData.id;
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
    }

    initializeLikedProperties();

    // Wire up any existing like buttons on the page (static or dynamically added)
    function initializeGlobalLikeButtons() {
        const wispaUser = localStorage.getItem('wispaUser');
        if (!wispaUser) {
            console.log('User not logged in, skipping like button initialization');
            return;
        }
        
        const userData = JSON.parse(wispaUser);
        const userId = userData.id;
        
        const selector = '.similar-property-like-btn, .like-btn';
        document.querySelectorAll(selector).forEach(btn => {
            // avoid double-binding
            if (btn.dataset._likeInit) return;
            btn.dataset._likeInit = '1';
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const id = this.dataset.id || this.dataset.propertyId || this.getAttribute('data-id') || this.getAttribute('data-property-id');
                if (!id) return;
                const liked = JSON.parse(localStorage.getItem('likedProperties_' + userId) || '[]');
                const idx = liked.findIndex(x => String(x) === String(id));
                if (idx > -1) {
                    liked.splice(idx, 1);
                    this.classList.remove('liked');
                    this.textContent = '♡';

                    // remove existing like reaction for this user/post
                    try {
                        let reactions = JSON.parse(localStorage.getItem('notificationReactions') || '[]');
                        reactions = reactions.filter(r => !(String(r.postId) === String(id) && String(r.userId) === String(userId) && r.reaction === 'like'));
                        localStorage.setItem('notificationReactions', JSON.stringify(reactions));
                    } catch(e) { console.error(e); }
                } else {
                    liked.push(String(id));
                    this.classList.add('liked');
                    this.textContent = '♥';

                    // create a notification reaction for admin to see this like
                    try {
                        const reactions = JSON.parse(localStorage.getItem('notificationReactions') || '[]');
                        const prop = (typeof properties !== 'undefined' && Array.isArray(properties)) ? properties.find(p => String(p.id) === String(id)) : null;
                        const reactionObj = {
                            id: 'react-' + Date.now() + '-' + Math.random().toString(36).slice(2,8),
                            userId: userId,
                            userName: userData.username || userData.email || userId,
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
    }

    let filteredProperties = [...properties];
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

        propertiesToShow.forEach(property => {
            // Render homepage post using the similar-property-card layout
            const mainImage = property.images && property.images.length ? property.images[0] : (property.image || '');
            const totalMedia = property.images ? property.images.length : (property.image ? 1 : 0);
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
                const mainImage = property.images && property.images.length ? property.images[0] : placeholder;
                const featuredTotalMedia = property.images ? property.images.length : (property.image ? 1 : 0);
                const featuredMediaBadge = featuredTotalMedia >= 2 ? `<div class="image-counter">${featuredTotalMedia} 📷</div>` : '';
                const categoryClass = property.featured ? 'featured' : (property.hot ? 'hot' : 'available');
                const categoryLabel = categoryClass === 'hot' ? '🔥 Hot' : categoryClass === 'featured' ? '⭐ Featured' : '✓ Available';

                const card = document.createElement('a');
                card.className = 'similar-property-card';
                card.href = `property-detail.html?id=${property.id}&category=${categoryClass}`;
                card.innerHTML = `
                    <div style="position: relative;">
                        <img src="${mainImage}" alt="${property.title}" class="similar-property-image" loading="lazy">
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
            const img = property.images && property.images.length ? property.images[0] : placeholder;
            const hotTotalMedia = property.images ? property.images.length : (property.image ? 1 : 0);
            const hotMediaBadge = hotTotalMedia >= 2 ? `<div class="image-counter">${hotTotalMedia} 📷</div>` : '';
            const categoryClass = property.featured ? 'featured' : (property.hot ? 'hot' : 'available');
            const categoryLabel = categoryClass === 'hot' ? '🔥 Hot' : categoryClass === 'featured' ? '⭐ Featured' : '✓ Available';

            const card = document.createElement('a');
            card.className = 'similar-property-card';
            card.href = `property-detail.html?id=${property.id}&category=hot`;
            card.innerHTML = `
                <div style="position:relative;">
                    <img src="${img}" alt="${property.title}" class="similar-property-image" loading="lazy" onload="this.setAttribute('loaded', '')" onerror="this.onerror=null;this.src='${placeholder}';this.setAttribute('loaded','')">
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
            const imgSrc = prop.images && prop.images.length ? prop.images[0] : (prop.image || placeholder);
            const availTotalMedia = prop.images ? prop.images.length : (prop.image ? 1 : 0);
            const availMediaBadge = availTotalMedia >= 2 ? `<div class="image-counter">${availTotalMedia} 📷</div>` : '';
            const card = document.createElement('a');
            card.className = 'similar-property-card';
            card.href = `property-detail.html?id=${prop.id}&category=available`;
            card.innerHTML = `
                <div style="position:relative;">
                    <img src="${imgSrc}" alt="${prop.title || 'Property'}" class="similar-property-image" loading="lazy" onload="this.setAttribute('loaded', '')" onerror="this.onerror=null;this.src='${placeholder}';this.setAttribute('loaded','')">
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
                console.warn('Image upload failed, falling back to using object URLs for preview', e);
                images = Array.from(mediaInput.files).map(f => URL.createObjectURL(f));
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
            const wispaUser = localStorage.getItem('wispaUser');
            if (!wispaUser) return null;
            const userData = JSON.parse(wispaUser);
            return userData.id;
        } catch (e) {
            return null;
        }
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
        if (sender === 'user') {
            try {
                const wispaUser = JSON.parse(localStorage.getItem('wispaUser') || '{}');
                if (wispaUser.username) msg.userName = wispaUser.username;
                if (wispaUser.email) msg.userEmail = wispaUser.email;
                if (wispaUser.id) msg.userId = wispaUser.id;
            } catch (e) { /* ignore */ }
        }

        list.push(msg);
        // Try to persist message to server; fallback to localStorage
        (async function(){
            try {
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
                // Normalize backend fields to frontend shape so images display correctly
                properties = properties.map(p => {
                    const prop = Object.assign({}, p);
                    if (prop.image_url && !prop.image) prop.image = prop.image_url;
                    if (prop.image_url && (!prop.images || !Array.isArray(prop.images) || prop.images.length === 0)) prop.images = [prop.image_url];
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

    function saveProperty(property) {
        // Try saving to backend API first
        try {
            const body = {
                property: property,
                photoUrls: Array.isArray(property.photoUrls) ? property.photoUrls : (property.photos || [])
            };
            const poster = (typeof window !== 'undefined' && window.apiFetch) ? window.apiFetch : fetch;
            return poster('/api/properties', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            .then(async response => {
                // apiFetch may return parsed JSON or a Response
                let data;
                if (!response) throw new Error('No response from API');
                if (typeof response.json === 'function') {
                    if (!response.ok) throw new Error('API save failed');
                    data = await response.json();
                } else {
                    data = response;
                }
                // After a successful save, refresh server state so all devices sync
                try { await loadProperties(); } catch(e) { /* ignore */ }
                return property;
            })
            .catch(err => {
                console.warn('saveProperty API failed, falling back to localStorage', err);
                properties.push(property);
                try { localStorage.setItem('properties', JSON.stringify(properties)); } catch(e){}
                return Promise.resolve(property);
            });
        } catch (e) {
            // Fallback to localStorage
            properties.push(property);
            try { localStorage.setItem('properties', JSON.stringify(properties)); } catch(e){}
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
        // TODO: Implement /api/user/liked-properties endpoint in backend
        // return fetch('/api/user/liked-properties')
        //     .then(response => response.json())
        //     .then(data => Array.isArray(data.liked) ? data.liked : [])
        //     .catch(() => []);
        return Promise.resolve([]);
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
        // TODO: Implement /api/notifications?userId=... endpoint in backend
        // return fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`)
        //     .then(response => response.json())
        //     .then(data => Array.isArray(data.notifications) ? data.notifications : [])
        //     .catch(() => []);
        return Promise.resolve([]);
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
        // TODO: Implement /api/conversations?userId=... endpoint in backend
        // return fetch(`/api/conversations?userId=${encodeURIComponent(userId)}`)
        //     .then(response => response.json())
        //     .then(data => Array.isArray(data.conversations) ? data.conversations : [])
        //     .catch(() => []);
        return Promise.resolve([]);
    }

    function renderChatMessages(messages) {
        chatMessages.innerHTML = '';
        messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.textContent = `${msg.timestamp}: ${msg.text}`;
            chatMessages.appendChild(msgDiv);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendChatMessage(text) {
        // TODO: Connect to real DB - Send chat message via API
        // return fetch('/api/chat/send', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ message: text })
        // }).then(() => loadChatMessages());

        // For now, use localStorage
        const messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
        const newMsg = {
            text: text,
            timestamp: new Date().toLocaleString()
        };
        messages.push(newMsg);
        localStorage.setItem('chatMessages', JSON.stringify(messages));
        loadChatMessages();
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
    
    // Initial load
    loadProperties().then((loadedProperties) => {
        properties = loadedProperties;
        filteredProperties = [...properties];
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
