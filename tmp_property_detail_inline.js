
//---- INLINE SCRIPT ----

        // Get property ID and category from URL query parameters
        const urlParams = new URLSearchParams(window.location.search);
        const propertyId = urlParams.get('id') || 'Unknown';
        const category = urlParams.get('category') || 'available';

        // Use only admin-saved properties (populated from the API).
        // No client-side persistent `localStorage` usage — use in-memory maps instead.
        const propertiesMap = {};

        // Helper to read all liked properties across users (in-memory)
        function getAllLikedProperties() {
            const map = window._wispaLikedProperties || {};
            const out = [];
            Object.values(map).forEach(arr => { if (Array.isArray(arr)) out.push(...arr); });
            return out;
        }

        // Inline fallback SVG image (avoids external DNS failures like via.placeholder.com)
        const FALLBACK_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">'
            + '<rect width="100%" height="100%" fill="#f3f4f6"/>'
            + '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="Arial, Helvetica, sans-serif" font-size="24">Image not available</text>'
            + '</svg>'
        );

        let property = propertiesMap[propertyId] || { title: 'Property Not Found', price: 'N/A', location: 'Unknown', images: [FALLBACK_IMAGE] };

        // Normalize image URLs to avoid mixed-content blocks (upgrade http -> https when page is https)
        function normalizeImageUrl(u){
            try{
                if(!u) return u;
                const s = String(u).trim();
                if(s.indexOf('data:') === 0) return s;
                if(location && location.protocol === 'https:'){
                    if(s.startsWith('http://')) return s.replace(/^http:/,'https:');
                    if(s.startsWith('//')) return 'https:' + s;
                }
                return s;
            }catch(e){ return u; }
        }

        // Expose lightweight current property info for chat/message helpers to include
        try {
            window.__currentProperty = {
                id: property.id || propertyId,
                title: property.title || '',
                price: property.price || '',
                location: property.location || property.address || '',
                image: (property.images && property.images[0]) || property.image || ''
            };
        } catch(e) {}

        // If this page is being opened from a conversation, hide the contact/admin contact section
        const convParam = urlParams.get('conversation') || urlParams.get('conv') || null;
        if (convParam === 'true') {
            const contactSection = document.querySelector('.contact-admin-section');
            if (contactSection) contactSection.style.display = 'none';
        }

        // Clear static/demo similar properties so only dynamic content is shown
        try{
            const simGrid = document.getElementById('similarPropertiesGrid');
            if(simGrid) simGrid.innerHTML = '<!-- dynamic content loaded by script.js -->';
        }catch(e){}

        // Normalize price string for display
        if (typeof property.price === 'number') {
            property.price = '€' + property.price.toLocaleString();
        }

        // Ensure images array exists (fallback to image field)
        if (!property.images || !Array.isArray(property.images)) {
            if (property.image) property.images = [property.image];
            else property.images = property.images || [];
        }

        // Render description (use admin-saved description if available)
        const detailDescDiv = document.querySelector('.property-detail-description');
        if (detailDescDiv) {
            if (property.description && property.description.trim() !== '') {
                // allow basic line breaks to become paragraphs
                const paragraphs = property.description.split(/\n+/).map(p => `<p>${p.trim()}</p>`).join('');
                detailDescDiv.innerHTML = paragraphs;
            } else {
                // keep default content if no description provided
            }
        }

        // Carousel variables
        let currentImageIndex = 0;
        let propertyImages = [];

        // Initialize carousel or single image
        function initializeImages() {
            const carousel = document.getElementById('imageCarousel');
            const singleImage = document.getElementById('propertyImage');
            
            if (property.images && property.images.length > 1) {
                // Multiple images - use carousel
                propertyImages = property.images;
                carousel.style.display = 'block';
                singleImage.style.display = 'none';
                
                // Populate carousel images
                const carouselImagesDiv = document.getElementById('carouselImages');
                carouselImagesDiv.innerHTML = propertyImages.map(src => {
                    const isVideo = typeof src === 'string' && src.indexOf('data:video') === 0 || (typeof src === 'string' && src.match(/\.(mp4|webm|ogg)(\?|$)/i));
                    if (isVideo) {
                        return `<video controls class="carousel-image"><source src="${src}"></video>`;
                    }
                    return `<img src="${src}" alt="Property image" class="carousel-image">`;
                }).join('');

                // Normalize src and attach error handler to carousel images
                Array.from(carouselImagesDiv.querySelectorAll('img.carousel-image')).forEach(el => {
                    const raw = el.getAttribute('src');
                    el.src = normalizeImageUrl(raw);
                    el.addEventListener('error', function() { if (this.src !== FALLBACK_IMAGE) this.src = FALLBACK_IMAGE; });
                });
                
                // Set total images count
                document.getElementById('totalImages').textContent = propertyImages.length;
                
                // Create dots
                const dotsDiv = document.getElementById('carouselDots');
                dotsDiv.innerHTML = propertyImages.map((_, idx) => 
                    `<div class="dot ${idx === 0 ? 'active' : ''}" onclick="goToImage(${idx})"></div>`
                ).join('');
                
                // Add click handler to carousel images
                document.querySelectorAll('.carousel-image').forEach((el, idx) => {
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', function(e) {
                        e.preventDefault();
                        nextImage();
                    });
                });
            } else {
                // Single image
                carousel.style.display = 'none';
                singleImage.style.display = 'block';
                // If single media is a video, render a video element instead
                const singleSrc = property.images && property.images.length > 0 ? property.images[0] : (property.image || FALLBACK_IMAGE);
                const isVideoSingle = typeof singleSrc === 'string' && singleSrc.indexOf('data:video') === 0 || (typeof singleSrc === 'string' && singleSrc.match(/\.(mp4|webm|ogg)(\?|$)/i));
                if (isVideoSingle) {
                    singleImage.style.display = 'none';
                    // remove existing video if any
                    const existing = document.getElementById('propertySingleVideo');
                    if (existing) existing.remove();
                    const vid = document.createElement('video');
                    vid.id = 'propertySingleVideo';
                    vid.controls = true;
                    vid.className = 'property-detail-image';
                    vid.src = normalizeImageUrl(singleSrc);
                    singleImage.parentNode.insertBefore(vid, singleImage.nextSibling);
                } else {
                    // normal image
                    const existing = document.getElementById('propertySingleVideo');
                    if (existing) existing.remove();
                    singleImage.style.display = 'block';
                    singleImage.src = normalizeImageUrl(singleSrc);
                    singleImage.addEventListener('error', function(){ if (this.src !== FALLBACK_IMAGE) this.src = FALLBACK_IMAGE; });
                }
            }
        }

        // Navigate carousel
        window.prevImage = function() {
            currentImageIndex = (currentImageIndex - 1 + propertyImages.length) % propertyImages.length;
            updateCarousel();
        };

        window.nextImage = function() {
            currentImageIndex = (currentImageIndex + 1) % propertyImages.length;
            updateCarousel();
        };

        window.goToImage = function(index) {
            currentImageIndex = index;
            updateCarousel();
        };

        function updateCarousel() {
            const carouselImages = document.getElementById('carouselImages');
            const offset = -currentImageIndex * 100;
            carouselImages.style.transform = `translateX(${offset}%)`;
            
            document.getElementById('currentImageIndex').textContent = currentImageIndex + 1;
            
            // Update dots
            document.querySelectorAll('.dot').forEach((dot, idx) => {
                dot.classList.toggle('active', idx === currentImageIndex);
            });
        }

        // Try to fetch authoritative property from API and update page.
        // Fetch the single property by id first (fast), then fall back to listing fetch.
        (async function(){
            try {
                // Attempt single-property fetch to reduce payload and latency
                if (propertyId && propertyId !== 'Unknown') {
                    try {
                        const singleUrl = '/api/properties/' + encodeURIComponent(propertyId);
                        const pres = window.apiFetch ? await window.apiFetch(singleUrl) : await fetch(singleUrl);
                        if (pres && pres.ok && typeof pres.json === 'function') {
                            const pdata = await pres.json();
                            if (pdata && pdata.property) {
                                property = pdata.property;
                            }
                        }
                    } catch (e) {
                        // ignore single-property errors and fall back to list fetch below
                    }
                }

                // If single fetch did not yield a property, fall back to fetching the list
                if (!property || !property.id) {
                    const res = window.apiFetch ? await window.apiFetch('/api/properties') : await fetch('/api/properties');
                    if (res && res.ok && typeof res.json === 'function') {
                        const data = await res.json();
                        const arr = Array.isArray(data) ? data : (data && Array.isArray(data.properties) ? data.properties : []);
                        if (Array.isArray(arr) && arr.length) {
                            arr.forEach(p => { if (p && p.id != null) propertiesMap[String(p.id)] = p; });
                            // if the API provided this property, use it (prefer DB record)
                            const remote = propertiesMap[propertyId] || arr.find(x => String(x.id) === String(propertyId) || String(x.propertyId) === String(propertyId));
                            if (remote) {
                                property = remote;
                            }
                        }
                    }
                }
            } catch (e) {
                // ignore and continue with localStorage fallback
            }

            // Normalize price string for display
            if (typeof property.price === 'number') property.price = '€' + property.price.toLocaleString();

            // Map backend `image_url` to `image` so pages that expect `image` work
            try { if (!property.image && property.image_url) property.image = property.image_url; } catch(e) {}

            // Ensure images array exists (fallback to image field)
            if (!property.images || !Array.isArray(property.images)) {
                if (property.image) property.images = [property.image];
                else property.images = property.images || [];
            }

            // Render description
            const detailDescDiv = document.querySelector('.property-detail-description');
            if (detailDescDiv && property.description && property.description.trim() !== '') {
                const paragraphs = property.description.split(/\n+/).map(p => `<p>${p.trim()}</p>`).join('');
                detailDescDiv.innerHTML = paragraphs;
            }

            // Initialize images/carousel now that we have the data
            initializeImages();

            // Populate the page fields
            const titleEl = document.getElementById('propertyTitle'); if (titleEl) titleEl.textContent = property.title;
            const priceEl = document.getElementById('propertyPrice'); if (priceEl) priceEl.textContent = property.price;
            const locEl = document.getElementById('propertyLocation'); if (locEl) locEl.textContent = property.location;
            // Post badge (where the property was posted) - prefer `postTo` or `post_to` or `sale_rent`
            try {
                const postBadgeEl = document.getElementById('postBadge');
                const categoryBadgeEl = document.getElementById('categoryBadge');
                const postVal = property.postTo || property.post_to || property.post || property.sale_rent || property.saleRent || '';
                if (postBadgeEl && postVal) {
                    // Set text and show the canonical badge in the title area
                    postBadgeEl.textContent = String(postVal).toUpperCase();
                    postBadgeEl.style.display = 'inline-block';
                    // normalize badge class (hot/featured/available)
                    postBadgeEl.classList.remove('hot','featured','available');
                    if (property.hot) postBadgeEl.classList.add('hot');
                    else if (property.featured) postBadgeEl.classList.add('featured');
                    else postBadgeEl.classList.add('available');
                    // Hide any overlay badges that may exist inside the image container to avoid duplicates
                    try{
                        document.querySelectorAll('.property-image-container .property-post-badge').forEach(el => {
                            if (el !== postBadgeEl) el.style.display = 'none';
                        });
                    }catch(e){}
                }
                // category badge (type) e.g., Apartment, House
                const catVal = property.type || property.property_type || property.category || '';
                // Only show category badge when a post badge isn't already displayed.
                if (categoryBadgeEl && catVal) {
                    if (postBadgeEl && postBadgeEl.style && postBadgeEl.style.display && postBadgeEl.style.display !== 'none') {
                        // hide category badge to avoid duplicate badges
                        categoryBadgeEl.style.display = 'none';
                    } else {
                        categoryBadgeEl.textContent = String(catVal);
                        categoryBadgeEl.style.display = 'inline-block';
                    }
                }
            } catch (e) {}

            // Meta info: area, bedrooms, bathrooms
            try {
                const metaEl = document.getElementById('propertyMeta');
                if (metaEl) {
                    const beds = (property.bedrooms != null && property.bedrooms !== '') ? property.bedrooms : (property.beds != null ? property.beds : null);
                    const baths = (property.bathrooms != null && property.bathrooms !== '') ? property.bathrooms : (property.baths != null ? property.baths : null);
                    const area = (property.area != null && property.area !== '') ? property.area : (property.size != null ? property.size : null);
                    const parts = [];
                    if (beds != null) parts.push((Number(beds) || beds) + ' bed');
                    if (baths != null) parts.push((Number(baths) || baths) + ' bath');
                    if (area != null) parts.push((Number(area) || area) + ' m²');
                    metaEl.textContent = parts.join(' • ');
                    if (!metaEl.textContent) metaEl.style.display = 'none';
                }
            } catch(e) {}
            document.title = (property.title || 'Property') + ' - Wispa Real Estate';

            // Refresh similar properties section now that propertiesMap may include API entries
            try { displaySimilarProperties(); } catch(e) {}
            try { initializeLikeButton(); } catch(e) {}
        })();

        // Keyboard navigation for carousel
        window.openChat = async function() {
            const modal = document.getElementById('propertyDetailChatModal');
            if (!modal) return;
            modal.style.display = 'flex';
            const messagesDiv = document.getElementById('propertyDetailChatMessages');

            // Ensure user is logged in
            const userObj = (window.getCurrentUser ? await window.getCurrentUser() : null);
            const userId = userObj && userObj.id ? userObj.id : null;
            if (!userId) {
                messagesDiv.innerHTML = '<p style="text-align:center;color:var(--secondary);">Please log in to chat with an agent.</p>';
                return;
            }

            const convId = 'property-' + propertyId;
            function renderPropertyCard(prop){
                try{
                    const existing = document.getElementById('property-chat-card');
                    if(existing) existing.remove();
                    if(!prop) return;
                    const card = document.createElement('div');
                    card.id = 'property-chat-card';
                    card.style.cssText = 'padding:12px;border-radius:8px;background:#f8fafc;margin-bottom:10px;display:flex;gap:12px;align-items:center;box-shadow:var(--shadow);';
                    const img = (prop.image || (prop.images && prop.images[0])) || '';
                    const title = prop.title || prop.name || 'Property';
                    const price = (prop.price != null) ? (`$${Number(prop.price).toLocaleString()}`) : '';
                    const loc = prop.location || prop.address || '';
                    if(img){
                        const i = document.createElement('img'); i.src = normalizeImageUrl(img); i.alt = title; i.style.cssText = 'width:84px;height:64px;object-fit:cover;border-radius:6px;'; card.appendChild(i);
                    }
                    // Make the card clickable to open the property detail page but mark as conversation view
                    card.style.cursor = 'pointer';
                    try{
                        const pid = prop.id || prop.propertyId || prop.id || '';
                        card.addEventListener('click', function(){ if(pid) window.location.href = 'property-detail.html?id='+encodeURIComponent(pid)+'&conversation=true'; });
                    }catch(e){}
                    const info = document.createElement('div');
                    const infoTitle = document.createElement('div');
                    infoTitle.style.cssText = 'font-weight:700;margin-bottom:4px';
                    infoTitle.textContent = title || '';
                    const infoSub = document.createElement('div');
                    infoSub.style.cssText = 'color:#666;font-size:13px';
                    infoSub.textContent = (loc || '') + (price ? (' — ' + price) : '');
                    info.appendChild(infoTitle);
                    info.appendChild(infoSub);
                    card.appendChild(info);
                    messagesDiv.parentNode.insertBefore(card, messagesDiv);
                }catch(e){console.warn('renderPropertyCard error', e);} 
            }

            function renderList(list){
                messagesDiv.innerHTML = '';
                (list || []).forEach(m => {
                    const el = document.createElement('div');
                    const text = m.body || m.content || m.text || (m.meta && m.meta.text) || '';
                    const isUser = (m.sender === 'user' || String(m.sender_id) === String(userId) || (m.userId && String(m.userId) === String(userId)));
                    if (isUser) {
                        el.style.cssText = 'margin: 10px 0; padding: 10px; background: var(--primary); color: white; border-radius: 8px; text-align: right;';
                    } else {
                        el.style.cssText = 'margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 8px; text-align: left;';
                    }
                    // sender label
                    try{
                        const label = document.createElement('div');
                        label.style.cssText = 'font-size:12px;font-weight:600;margin-bottom:6px;color:' + (isUser ? 'white' : '#666') + ';';
                        label.textContent = isUser ? (m.userName || m.userEmail || 'You') : (m.userName || m.sender || m.from || 'Agent');
                        el.appendChild(label);
                    }catch(e){}
                    // message text
                    const bodyDiv = document.createElement('div');
                    bodyDiv.style.whiteSpace = 'pre-wrap';
                    bodyDiv.textContent = text;
                    el.appendChild(bodyDiv);
                    // attachments
                    try{
                        const at = (m.meta && m.meta.attachments) || (m.attachments);
                        if(Array.isArray(at) && at.length){
                            const aWrap = document.createElement('div');
                            aWrap.style.marginTop = '8px';
                            at.forEach(url => {
                                if(!url) return;
                                const low = String(url).toLowerCase();
                                if(low.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/)){
                                    const im = document.createElement('img'); im.src = normalizeImageUrl(url); im.style.cssText = 'max-width:180px;display:block;margin-top:6px;border-radius:6px;'; aWrap.appendChild(im);
                                } else {
                                    const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.textContent = url.split('/').pop() || url; link.style.cssText = 'display:block;margin-top:6px;color:#0366d6;'; aWrap.appendChild(link);
                                }
                            });
                            el.appendChild(aWrap);
                        }
                    }catch(e){ }
                    messagesDiv.appendChild(el);
                });
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            // Try loading from API, fallback to in-memory
            try {
                const fetcher = window.apiFetch ? window.apiFetch : fetch;
                const r = await fetcher('/api/conversations/' + encodeURIComponent(convId) + '/messages');
                const data = r && r.ok ? await r.json() : { messages: [] };
                renderList(Array.isArray(data.messages) ? data.messages : []);
            } catch (e) {
                const messagesKey = 'wispaMessages_' + userId + '_' + convId;
                window._wispaMessages = window._wispaMessages || {};
                renderList(window._wispaMessages[messagesKey] || (window.getConversationMessages ? window.getConversationMessages(convId) : []));
            }

            // Subscribe for live updates if provided
            if (window.subscribeConversation) {
                window.subscribeConversation(convId, (list) => renderList(list || []));
            }

            loadPropertyDocuments();
            const input = document.getElementById('propertyDetailChatInput');
            if (input) input.focus();
        };

        // Context values used by similarity matching
        const currentPropId = (function(){ try{ const n = parseInt(propertyId); return isNaN(n)? (property && property.id? Number(property.id): null) : n; }catch(e){ return (property && property.id)? Number(property.id) : null; } })();
        const currentLocation = (property && (property.location || property.address)) ? (property.location || property.address) : '';
        const currentPrice = (function(){ try{ if(!property) return 0; if(typeof property.price === 'number') return Number(property.price); const s = String(property.price||'').replace(/[^0-9]/g,''); return s? parseInt(s): 0; }catch(e){ return 0; } })();
        const priceRange = Math.max(20000, Math.round(Math.abs(currentPrice) * 0.2));
        const likedProperties = (getAllLikedProperties()||[]).map(v=>{ const n = Number(v); return isNaN(n)? v : n; });
        const fromLikes = (new URLSearchParams(window.location.search).get('fromLikes') === 'true');

            function findSimilarProperties() {
            const similarProps = [];

            // Find similar properties
            Object.entries(propertiesMap).forEach(([id, prop]) => {
                const propId = parseInt(id);
                
                // Skip current property
                if (propId === currentPropId) return;

                const propPriceStr = String(prop.price).replace(/[€\s,]/g, '');
                const propPrice = parseInt(propPriceStr) || 0;

                // Check similarity: same location OR price within range
                const sameLocation = prop.location === currentLocation;
                const priceMatch = Math.abs(propPrice - currentPrice) <= priceRange;

                if (sameLocation || priceMatch) {
                    // If coming from likes page, only include properties that are liked
                    if (fromLikes && !likedProperties.includes(propId)) {
                        return;
                    }
                    
                    similarProps.push({
                        id: propId,
                        ...prop,
                        category: getCategory(propId),
                        matchType: sameLocation && priceMatch ? 'both' : (sameLocation ? 'location' : 'price')
                    });
                }
            });

            // Limit to 8 similar properties
            similarProps.sort((a, b) => {
                // Prioritize both location and price matches
                if (a.matchType === 'both' && b.matchType !== 'both') return -1;
                if (b.matchType === 'both' && a.matchType !== 'both') return 1;
                return 0;
            });

            return similarProps.slice(0, 8);
            }

        // Display similar properties
        function displaySimilarProperties() {
            const similarProps = findSimilarProperties();
            const container = document.getElementById('similarPropertiesGrid');
            const section = document.getElementById('similarPropertiesSection');
            const sectionHeading = section.querySelector('h2');

            if (similarProps.length === 0) {
                section.style.display = 'none';
                return;
            }

            // Update heading based on whether viewing from likes page
            const urlParams = new URLSearchParams(window.location.search);
            const fromLikes = urlParams.get('fromLikes') === 'true';
            if (fromLikes) {
                sectionHeading.textContent = 'Similar Properties In Your Likes';
            } else {
                sectionHeading.textContent = 'Similar Properties You Might Like';
            }

            const allLiked = getAllLikedProperties();
            container.innerHTML = similarProps.map(prop => {
                const isLiked = allLiked.includes(prop.id);
                const imageCount = prop.images ? prop.images.length : 1;
                const imageCountBadge = imageCount > 1 ? `<div style="position: absolute; top: 10px; right: 10px; background: rgba(0, 0, 0, 0.7); color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; z-index: 5;">${imageCount} 📷</div>` : '';
                
                // Preserve fromLikes parameter in similar property links
                const urlParams = new URLSearchParams(window.location.search);
                const fromLikes = urlParams.get('fromLikes') === 'true' ? '&fromLikes=true' : '';
                
                return `
                <a href="property-detail.html?id=${prop.id}&category=${prop.category}${fromLikes}" class="similar-property-card">
                    <div style="position: relative;">
                        <img src="${prop.image || (prop.images ? prop.images[0] : '')}" alt="${prop.title}" class="similar-property-image">
                        ${imageCountBadge}
                    </div>
                    <div class="similar-property-info">
                        <div class="similar-property-price">${prop.price}</div>
                        <div class="similar-property-title">${prop.title}</div>
                        ${prop.bedrooms || prop.bathrooms || prop.area ? `<div class="similar-property-details">${prop.bedrooms || 0} bed • ${prop.bathrooms || 0} bath • ${prop.area || 0} m²</div>` : ''}\n                        <div class="similar-property-location">${prop.location}</div>
                    </div>
                    <div class="similar-property-footer">
                        <span class="similar-property-label ${prop.category}">
                            ${prop.category === 'hot' ? '🔥 Hot' : prop.category === 'featured' ? '⭐ Featured' : '✓ Available'}
                        </span>
                        <button class="similar-property-like-btn ${isLiked ? 'liked' : ''}" data-property-id="${prop.id}" onclick="toggleSimilarPropertyLike(event, ${prop.id})">${isLiked ? '♥' : '♡'}</button>
                    </div>
                </a>
            `}).join('');
        }

        // Toggle like for similar properties
        window.toggleSimilarPropertyLike = async function(event, propertyId) {
            event.stopPropagation();
            event.preventDefault();
            const btn = event.target;
            const userObj = await window.getCurrentUser();
            if (!userObj) {
                alert('Please log in to like properties');
                window.location.href = 'login.html';
                return;
            }
            const userId = userObj.id;
            window._wispaLikedProperties = window._wispaLikedProperties || {};
            const likedProperties = window._wispaLikedProperties[userId] || [];
            const index = likedProperties.indexOf(propertyId);
            if (index > -1) {
                likedProperties.splice(index, 1);
                btn.textContent = '♡';
                btn.classList.remove('liked');
            } else {
                likedProperties.push(propertyId);
                btn.textContent = '♥';
                btn.classList.add('liked');
            }
            window._wispaLikedProperties[userId] = likedProperties;
        };

        // Display similar properties on page load
        displaySimilarProperties();

        // Generate default property message for contacts
        function getPropertyMessage() {
            return `Hi! I'm interested in "${property.title}" located in ${property.location}, priced at ${property.price}. Could you provide more information about this property?`;
        }

        // Open WhatsApp with property message
        window.openWhatsApp = function() {
            const propertyMessage = getPropertyMessage();
            const encodedMessage = encodeURIComponent(propertyMessage);
            const whatsappURL = `https://wa.me/442079460957?text=${encodedMessage}`;
            window.open(whatsappURL, '_blank');
        };

        // Send email with property message
        window.sendEmail = function() {
            const propertyMessage = getPropertyMessage();
            const emailSubject = encodeURIComponent(`Property Inquiry: ${property.title}`);
            const emailBody = encodeURIComponent(propertyMessage + '\n\nPlease send me more details and booking information.');
            const mailtoURL = `mailto:admin@wisparealestate.com?subject=${emailSubject}&body=${emailBody}`;
            window.location.href = mailtoURL;
        };

        // Chat functionality
        window.openChat = async function() {
            const modal = document.getElementById('propertyDetailChatModal');
            if (modal) {
                modal.style.display = 'flex';
                const messagesDiv = document.getElementById('propertyDetailChatMessages');

                // Get current user via server session helper
                const curUser = (window.getCurrentUser ? await window.getCurrentUser() : null);
                const userId = curUser && curUser.id ? curUser.id : null;
                if (!userId) {
                    messagesDiv.innerHTML = '<p style="text-align:center;color:var(--secondary);">Please log in to chat with an agent.</p>';
                    return;
                }

                // Render existing conversation for this property
                const convId = 'property-' + propertyId;
                function renderList(list){
                    messagesDiv.innerHTML = '';
                    (list || []).forEach(m => {
                        const el = document.createElement('div');
                        const text = m.body || m.content || m.text || (m.meta && (m.meta.text || (m.meta.message && (m.meta.message.text || m.meta.message.body)))) || JSON.stringify(m);
                        const isUser = (m.sender === 'user' || String(m.sender_id) === String(userId) || (m.userId && String(m.userId) === String(userId)) || (m.meta && m.meta.userId && String(m.meta.userId) === String(userId)));
                        if (isUser) {
                            el.style.cssText = 'margin: 10px 0; padding: 10px; background: var(--primary); color: white; border-radius: 8px; text-align: right;';
                        } else {
                            el.style.cssText = 'margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 8px; text-align: left;';
                        }
                        el.textContent = text;
                        messagesDiv.appendChild(el);
                    });
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                };

                // Load existing messages from in-memory store (including admin replies)
                const messagesKey = 'wispaMessages_' + userId + '_' + convId;
                window._wispaMessages = window._wispaMessages || {};
                const existingMessages = Array.isArray(window._wispaMessages[messagesKey]) ? window._wispaMessages[messagesKey] : (window.getConversationMessages ? window.getConversationMessages(convId) : []);
                const existing = existingMessages && existingMessages.length ? existingMessages : [];

                // If first-time chat (no messages), show quick-message chooser
                if (!existing || existing.length === 0) {
                    // build quick choose UI
                    const chooser = document.createElement('div');
                    chooser.id = 'quickMessageChooser';
                    chooser.style.cssText = 'position:absolute;left:50%;top:20%;transform:translateX(-50%);background:var(--white);padding:16px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:2000;max-width:420px;width:90%;';
                    chooser.innerHTML = `
                        <div style="font-weight:700;margin-bottom:8px">Start with a quick message</div>
                        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
                            <button data-msg="Is this still available?" class="quick-msg btn">1. Still available?</button>
                            <button data-msg="I'm interested!" class="quick-msg btn">2. I am interested!</button>
                            <button data-msg="Can we talk more about this property?" class="quick-msg btn">3. Can we talk more about this property? </button>
                        </div>
                        <div style="display:flex;gap:8px;justify-content:flex-end">
                            <button id="quickCompose" class="btn">Compose my own</button>
                            <button id="quickSkip" class="btn">Skip</button>
                        </div>
                    `;

                    // ensure chooser isn't duplicated
                    const existingChooser = document.getElementById('quickMessageChooser');
                    if (existingChooser) existingChooser.remove();

                    // Insert chooser inside the modal content so it appears within the chat form
                    const modalContent = modal.firstElementChild || modal;
                    // ensure modal content is positioned so absolute child is relative to it
                    if (modalContent && getComputedStyle(modalContent).position === 'static') {
                        modalContent.style.position = 'relative';
                    }

                    // position chooser within modal
                    chooser.style.cssText = 'position:absolute;left:16px;right:16px;top:80px;background:var(--white);padding:14px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);z-index:2000;max-width:420px;margin:0 auto;';

                    modalContent.appendChild(chooser);

                    // handlers (scoped)
                    chooser.querySelectorAll('.quick-msg').forEach(btn => {
                        btn.addEventListener('click', async function(){
                            const text = this.dataset.msg || this.textContent;
                            // Get logged-in user info
                            const userName = (curUser && (curUser.full_name || curUser.username)) || (curUser && curUser.email) || 'Anonymous User';
                            const userEmail = (curUser && curUser.email) || '';
                            const uid = userId;

                            // Build payload matching sendPropertyDetailMessage
                            const payload = {
                                convId: convId,
                                message: {
                                    sender: 'user',
                                    text: text,
                                    userId: uid,
                                    ts: Date.now(),
                                        meta: {
                                        propertyId: propertyId,
                                        title: (property && property.title) ? property.title : ((window.__currentProperty && window.__currentProperty.title) ? window.__currentProperty.title : null),
                                        price: (property && property.price) ? property.price : ((window.__currentProperty && window.__currentProperty.price) ? window.__currentProperty.price : null),
                                        url: window.location.href
                                    }
                                }
                            };

                            let posted = false;
                            try {
                                const fetcher = window.apiFetch ? window.apiFetch : (u, o) => fetch(u, o);
                                const r = await fetcher('/api/conversations/messages', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload)
                                });
                                if (r && r.ok) {
                                    const body = await r.json();
                                    const returnedMsg = body && (body.message || (Array.isArray(body.messages) ? body.messages[body.messages.length-1] : null));
                                    // Ensure in-memory view is updated and subscribers notified
                                    window._wispaMessages = window._wispaMessages || {};
                                    const key = 'wispaMessages_' + uid + '_' + convId;
                                    window._wispaMessages[key] = window._wispaMessages[key] || [];
                                    if (returnedMsg) window._wispaMessages[key].push(returnedMsg);
                                    else window._wispaMessages[key].push({ sender: 'user', text: text, ts: Date.now(), userName, userEmail });
                                    if (typeof window.publishConversation === 'function') {
                                        try { window.publishConversation(convId, window._wispaMessages[key]); } catch(e){}
                                    }
                                    renderList(window._wispaMessages[key]);
                                    if (typeof showNotification === 'function') showNotification('Message sent');
                                    posted = true;
                                }
                            } catch (e) { /* fallthrough to local fallback */ }

                            if (!posted) {
                                // Fallback to in-memory store
                                window._wispaMessages = window._wispaMessages || {};
                                const key = 'wispaMessages_' + uid + '_' + convId;
                                window._wispaMessages[key] = window._wispaMessages[key] || [];
                                window._wispaMessages[key].push({ sender: 'user', text: text, ts: Date.now(), userName: userName, userEmail: userEmail });
                                if (typeof window.publishConversation === 'function') {
                                    try { window.publishConversation(convId, window._wispaMessages[key]); } catch(e){}
                                }
                                renderList(window._wispaMessages[key]);
                                if (typeof showNotification === 'function') showNotification('Message queued');
                            }

                            chooser.remove();
                        });
                    });

                    chooser.querySelector('#quickCompose').addEventListener('click', function(){
                        chooser.remove();
                        const inputEl = document.getElementById('propertyDetailChatInput');
                        if (inputEl) inputEl.focus();
                    });

                    chooser.querySelector('#quickSkip').addEventListener('click', function(){
                        chooser.remove();
                    });
                }

                // If no existing in-memory messages, try to load from API
                if (!existing || existing.length === 0) {
                    try {
                        const fetcher = window.apiFetch ? window.apiFetch : fetch;
                        const r = await fetcher('/api/conversations/' + encodeURIComponent(convId) + '/messages');
                        const data = r && r.ok ? await r.json() : { messages: [] };
                        renderList(Array.isArray(data.messages) ? data.messages : []);
                    } catch (e) {
                        renderList(existing || []);
                    }
                } else {
                    renderList(existing);
                }

                // Subscribe for live updates if provided
                if (window.subscribeConversation) {
                    window.subscribeConversation(convId, (list) => renderList(list || []));
                }

                loadPropertyDocuments();
                const input = document.getElementById('propertyDetailChatInput');
                if (input) input.focus();
            }
        };

        // Switch between chat tabs
        window.switchChatTab = function(tab) {
            const messagesTab = document.getElementById('messagesTab');
            const documentsTab = document.getElementById('documentsTab');
            const buttons = document.querySelectorAll('.chat-tab-btn');
            
            buttons.forEach(btn => {
                btn.style.background = 'transparent';
                btn.style.borderColor = 'var(--border)';
                btn.style.color = 'var(--text)';
            });
            
            if (tab === 'messages') {
                messagesTab.style.display = 'flex';
                documentsTab.style.display = 'none';
                buttons[0].style.background = 'white';
                buttons[0].style.borderColor = 'var(--primary)';
                buttons[0].style.color = 'var(--primary)';
            } else {
                messagesTab.style.display = 'none';
                documentsTab.style.display = 'block';
                buttons[1].style.background = 'white';
                buttons[1].style.borderColor = 'var(--primary)';
                buttons[1].style.color = 'var(--primary)';
            }
        };

        // Load property documents from admin (use server-provided properties list)
        function loadPropertyDocuments() {
            const properties = Array.isArray(window.properties) ? window.properties : [];
            const currentPropId = parseInt(propertyId);
            const adminProp = properties.find(p => {
                return p.id === currentPropId || p.title === property.title || (p.address && p.address === property.address);
            });

            const docsList = document.getElementById('propertyDocumentsList');
            
            if (!adminProp || !adminProp.documents) {
                docsList.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 20px;">No documents available for this property yet.</p>';
                return;
            }

            const docTypes = {
                purchase: '📤 Purchase Documents',
                construction: '🏗️ Construction Records',
                ownership: '🔐 Proof of Ownership',
                other: '📋 Additional Documents'
            };

            let html = '';
            let hasDocuments = false;

            Object.entries(docTypes).forEach(([key, label]) => {
                if (adminProp.documents[key]?.length > 0) {
                    hasDocuments = true;
                    html += `
                        <div class="document-section">
                            <h4>${label}</h4>
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                ${adminProp.documents[key].map((doc, idx) => `
                                    <div class="document-badge">
                                        📄 ${doc.name.substring(0, 20)}${doc.name.length > 20 ? '...' : ''}
                                        <button onclick="shareDocumentInChat('${doc.name}', '${label}')">📤</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            });

            if (!hasDocuments) {
                html = '<p style="color: var(--text-light); text-align: center; padding: 20px;">No documents available for this property yet.</p>';
            }

            docsList.innerHTML = html;
        }

        // Share document in chat
        window.shareDocumentInChat = function(docName, docType) {
            const messagesDiv = document.getElementById('propertyDetailChatMessages');
            const adminMessage = document.createElement('div');
            adminMessage.style.cssText = 'margin: 10px 0; padding: 12px; background: #f0f0f0; border-radius: 8px; text-align: left; font-size: 13px; border-left: 4px solid var(--primary);';
            adminMessage.innerHTML = `
                <strong>📄 Document Shared:</strong><br>
                ${docType}: ${docName}<br>
                <span style="font-size: 11px; color: var(--text-light);">✓ Verified and authentic</span>
            `;
            messagesDiv.appendChild(adminMessage);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            
            // Switch to messages tab
            switchChatTab('messages');
        };

        // Close chat modal
        function closePropertyDetailChat() {
            const modal = document.getElementById('propertyDetailChatModal');
            if (modal) {
                // Clear polling interval when modal closes
                if(modal._pollInterval) {
                    clearInterval(modal._pollInterval);
                    modal._pollInterval = null;
                }
                // Remove storage event listener
                if(modal._storageHandler) {
                    window.removeEventListener('storage', modal._storageHandler);
                    modal._storageHandler = null;
                }
                modal.style.display = 'none';
            }
        }

        // Send chat message (API-backed with in-memory fallback)
        window.sendPropertyDetailMessage = async function() {
            const input = document.getElementById('propertyDetailChatInput');
            const messagesDiv = document.getElementById('propertyDetailChatMessages');
            const convId = 'property-' + propertyId;

            if (!input || input.value.trim() === '') return;

            // Get logged-in user info from server session
            const wispaUser = (window.getCurrentUser ? await window.getCurrentUser() : null);
            const userName = (wispaUser && (wispaUser.username || wispaUser.email)) || 'Anonymous User';
            const userEmail = (wispaUser && wispaUser.email) || '';
            const userId = wispaUser && wispaUser.id ? wispaUser.id : null;

            const text = input.value.trim();

            // Build message payload including property metadata for admin
            const payload = {
                convId: convId,
                message: {
                    sender: 'user',
                    text: text,
                    meta: {
                        propertyId: propertyId,
                        title: (property && property.title) ? property.title : ((window.__currentProperty && window.__currentProperty.title) ? window.__currentProperty.title : null),
                        price: (property && property.price) ? property.price : ((window.__currentProperty && window.__currentProperty.price) ? window.__currentProperty.price : null),
                        url: window.location.href
                    }
                }
            };
            // Attach authenticated user id and timestamp so server can create conversation.user_id
            if (userId) payload.message.userId = userId;
            payload.message.ts = Date.now();

            // Try sending to server API
            try {
                const fetcher = window.apiFetch ? window.apiFetch : (url, opts) => fetch(url, opts);
                const res = await fetcher('/api/conversations/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res && res.ok) {
                    const body = await res.json();
                    // server may return { message } or { messages: [...] }
                    const msgs = Array.isArray(body.messages) ? body.messages : (body.message ? [body.message] : []);
                    // Render returned messages (append newest)
                    if (msgs.length > 0) {
                        msgs.forEach(m => {
                            const el = document.createElement('div');
                            if (m.sender === 'user' || m.sender === 'client' ) {
                                el.style.cssText = 'margin: 10px 0; padding: 10px; background: var(--primary); color: white; border-radius: 8px; text-align: right;';
                                el.textContent = m.text || m.body || m.content || text;
                            } else {
                                el.style.cssText = 'margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 8px; text-align: left;';
                                el.textContent = m.text || m.body || m.content || text;
                            }
                            messagesDiv.appendChild(el);
                        });
                    }
                    if (typeof showNotification === 'function') showNotification('Message sent');
                    input.value = '';
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    // Ensure admin conversation thread exists/updated so admin sees it
                    try{ upsertAdminChat(convId, userId, userName, text, propertyId, (property && property.title) || null); }catch(e){}
                    // persist returned messages to server KV for admin visibility (DB-only), otherwise localStorage
                    try{
                        if (userId) {
                            const lk = 'wispaMessages_' + userId + '_' + convId;
                            if (typeof window !== 'undefined' && window.WISPA_DB_ONLY) {
                                try{
                                    const respAll = await fetch('/api/storage/all');
                                    if (respAll && respAll.ok){ const j = await respAll.json(); const existing = (j && j.store && Array.isArray(j.store[lk])) ? j.store[lk] : (j && j.store && j.store[lk] && j.store[lk].value ? j.store[lk].value : []);
                                        const merged = Array.isArray(existing) ? existing.concat(msgs) : msgs.slice();
                                        await fetch('/api/storage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: lk, value: merged }) });
                                    }
                                }catch(e){}
                            } else {
                                try{ let arr = JSON.parse(localStorage.getItem(lk) || '[]'); msgs.forEach(m=>arr.push(m)); localStorage.setItem(lk, JSON.stringify(arr)); }catch(e){}
                            }
                        }
                    }catch(e){}
                    return;
                }
            } catch (e) {
                // fall through to in-memory fallback
            }

            // Fallback: save in-memory for user if API unavailable
            if (userId) {
                const key = 'wispaMessages_' + userId + '_' + convId;
                window._wispaMessages = window._wispaMessages || {};
                window._wispaMessages[key] = window._wispaMessages[key] || [];
                window._wispaMessages[key].push({ sender: 'user', text: text, ts: Date.now(), userName: userName, userEmail: userEmail });
                // render fallback-saved messages immediately
                const updated = window._wispaMessages[key] || [];
                messagesDiv.innerHTML = '';
                updated.forEach(m => {
                    const el = document.createElement('div');
                    if (m.sender === 'user') {
                        el.style.cssText = 'margin: 10px 0; padding: 10px; background: var(--primary); color: white; border-radius: 8px; text-align: right;';
                        el.textContent = m.text;
                    } else {
                        el.style.cssText = 'margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 8px; text-align: left;';
                        el.textContent = m.text;
                    }
                    messagesDiv.appendChild(el);
                });
                if (typeof showNotification === 'function') showNotification('Message queued');
                input.value = '';
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                // ensure admin thread exists when using fallback
                try{ upsertAdminChat(convId, userId, userName, text, propertyId, (property && property.title) || null); }catch(e){}
                // also persist fallback messages to server KV in DB-only mode, otherwise to localStorage so admin can read them
                try{
                    if(userId){
                        const lk = 'wispaMessages_' + userId + '_' + convId;
                        const newMsgs = window._wispaMessages[key] || [];
                        if (typeof window !== 'undefined' && window.WISPA_DB_ONLY) {
                            try{
                                const respAll = await fetch('/api/storage/all');
                                if (respAll && respAll.ok){ const j = await respAll.json(); const existing = (j && j.store && Array.isArray(j.store[lk])) ? j.store[lk] : (j && j.store && j.store[lk] && j.store[lk].value ? j.store[lk].value : []);
                                    const merged = Array.isArray(existing) ? existing.concat(newMsgs) : newMsgs.slice();
                                    await fetch('/api/storage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: lk, value: merged }) });
                                }
                            }catch(e){
                                // queue in-memory pending messages when KV unavailable
                                window._pendingPropertyMessages = window._pendingPropertyMessages || {};
                                window._pendingPropertyMessages[lk] = (window._pendingPropertyMessages[lk] || []).concat(newMsgs);
                            }
                        } else {
                            try{ let arr2 = JSON.parse(localStorage.getItem(lk) || '[]'); newMsgs.forEach(m=>arr2.push(m)); localStorage.setItem(lk, JSON.stringify(arr2)); }catch(e){}
                        }
                    }
                }catch(e){}
            }
        };

        // Create or update admin conversation metadata so admin UI sees the thread
        async function upsertAdminChat(convId, userId, userName, lastMessage, propertyId, propertyTitle){
            try{
                const KEY = 'adminChats';
                let arr = [];
                try{ 
                    if (typeof window !== 'undefined' && window.WISPA_DB_ONLY) {
                        // read adminChats from server KV
                        try{
                            const r = await fetch('/api/storage/all');
                            if (r && r.ok){ const j = await r.json(); arr = (j && j.store && Array.isArray(j.store[KEY])) ? j.store[KEY] : (j && j.store && j.store[KEY] && j.store[KEY].value ? j.store[KEY].value : []); }
                            else arr = [];
                        }catch(e){ arr = []; }
                    } else {
                        arr = JSON.parse(localStorage.getItem(KEY) || '[]');
                    }
                }catch(e){ arr = []; }
                let meta = arr.find(a => a.id === convId);
                const now = Date.now();
                if(!meta){
                    meta = { id: convId, userId: userId || null, participantName: userName || (userId?('User '+userId):'Guest'), lastMessage: lastMessage || '', updated: now, unread: 1, propertyId: propertyId || null, title: propertyTitle || null };
                    arr.unshift(meta);
                } else {
                    meta.lastMessage = lastMessage || meta.lastMessage;
                    meta.updated = now;
                    meta.unread = (Number(meta.unread)||0) + 1;
                    if(userId) meta.userId = userId;
                    if(propertyId) meta.propertyId = propertyId;
                    if(propertyTitle) meta.title = propertyTitle;
                }
                try{
                    if (typeof window !== 'undefined' && window.WISPA_DB_ONLY) {
                        try{ await fetch('/api/storage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: KEY, value: arr }) }); }catch(e){ window._pendingAdminChats = window._pendingAdminChats || []; window._pendingAdminChats.push({ key: KEY, value: arr }); }
                    } else {
                        localStorage.setItem(KEY, JSON.stringify(arr));
                    }
                }catch(e){}
                // also update chatNotifications for older admin UI paths
                try{
                    const KEY2 = 'chatNotifications';
                    let notifs = [];
                    try{
                        if (typeof window !== 'undefined' && window.WISPA_DB_ONLY) {
                            try{
                                const r2 = await fetch('/api/storage/all');
                                let notifsArr = [];
                                if (r2 && r2.ok){ const j2 = await r2.json(); notifsArr = (j2 && j2.store && Array.isArray(j2.store[KEY2])) ? j2.store[KEY2] : (j2 && j2.store && j2.store[KEY2] && j2.store[KEY2].value ? j2.store[KEY2].value : []); }
                                const nIdx = notifsArr.findIndex(n => n.id === convId);
                                const notif = { id: convId, title: propertyTitle || ('Conversation ' + convId), lastMessage: lastMessage || '', updated: now, unread: 1 };
                                if(nIdx === -1) notifsArr.unshift(notif); else { notifsArr[nIdx] = Object.assign({}, notifsArr[nIdx], notif); }
                                try{ await fetch('/api/storage', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: KEY2, value: notifsArr }) }); }catch(e){ window._pendingAdminNotifications = window._pendingAdminNotifications || []; window._pendingAdminNotifications.push(notif); }
                            }catch(e){ }
                        } else {
                            notifs = JSON.parse(localStorage.getItem(KEY2) || '[]');
                            const nIdx = notifs.findIndex(n => n.id === convId);
                            const notif = { id: convId, title: propertyTitle || ('Conversation ' + convId), lastMessage: lastMessage || '', updated: now, unread: 1 };
                            if(nIdx === -1) notifs.unshift(notif); else { notifs[nIdx] = Object.assign({}, notifs[nIdx], notif); }
                            try{ localStorage.setItem(KEY2, JSON.stringify(notifs)); }catch(e){}
                        }
                    }catch(e){}
                }catch(e){}
            }catch(e){ console.warn('upsertAdminChat failed', e); }
        }

        // Close modal when clicking outside
        window.addEventListener('click', function(event) {
            const modal = document.getElementById('propertyDetailChatModal');
            if (modal && event.target === modal) {
                modal.style.display = 'none';
            }
        });

        // Allow Enter key to send message
        document.addEventListener('keypress', function(event) {
            if (event.key === 'Enter' && document.activeElement.id === 'propertyDetailChatInput') {
                sendPropertyDetailMessage();
            }
        });
    
