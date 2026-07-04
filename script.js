// Venues loaded from backend (populated by admin dashboard)
let VENUES = [];
let EVENTS = [];

// State management
let formData = {
    name: '',
    phone: '',
    modelId: null,
    selectedVenue: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    extractModelIdFromURL();
    await Promise.all([loadVenues(), loadEvents()]);
    // Verify backend endpoints (non-blocking)
    verifyBackendEndpoints();
    // Register service worker and subscribe for push notifications
    try { await registerServiceWorkerAndSubscribe(); } catch(e) { console.warn('Push registration failed', e); }
    setupEventListeners();
    logAnalytics('page_loaded', { modelId: formData.modelId });
});

function setFormError(message) {
    let errorEl = document.getElementById('formError');
    if (!errorEl) {
        const form = document.getElementById('dataForm');
        errorEl = document.createElement('div');
        errorEl.id = 'formError';
        errorEl.className = 'form-error';
        form.parentNode.insertBefore(errorEl, form.nextSibling);
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function clearFormError() {
    const errorEl = document.getElementById('formError');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

// Extract ModelID from URL (wett.vip/tag/[ModelID])
function extractModelIdFromURL() {
    const pathSegments = window.location.pathname.split('/');
    const tagIndex = pathSegments.indexOf('tag');
    
    if (tagIndex !== -1 && pathSegments[tagIndex + 1]) {
        formData.modelId = pathSegments[tagIndex + 1];
        console.log('Model ID extracted:', formData.modelId);
    } else {
        // No modelId present (do not use test fallback in production)
        formData.modelId = null;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Form submission
    const dataForm = document.getElementById('dataForm');
    dataForm.addEventListener('submit', handleFormSubmit);

    // Venue selection
    document.addEventListener('click', function(e) {
        if (e.target.closest('.claim-btn')) {
            const venueId = e.target.closest('.claim-btn').dataset.venueId;
            handleVenueSelection(venueId);
        }
    });

    // Reset/Navigation buttons
    document.getElementById('resetForm').addEventListener('click', resetToForm);
    document.getElementById('claimAnother').addEventListener('click', resetToVenues);
    document.getElementById('done').addEventListener('click', completedFlow);

    // Phone input formatting
    const phoneInput = document.getElementById('phone');
    phoneInput.addEventListener('input', function(e) {
        e.target.value = formatPhoneNumber(e.target.value);
    });
}

// Format phone number
function formatPhoneNumber(value) {
    const cleaned = value.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    
    if (!match) return value;
    
    let formatted = '';
    if (match[1]) formatted = `(${match[1]}`;
    if (match[2]) formatted += `) ${match[2]}`;
    if (match[3]) formatted += `-${match[3]}`;
    
    return formatted.trim();
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();

    const nameInput = document.getElementById('name');
    const phoneInput = document.getElementById('phone');

    // Validation
    if (!nameInput.value.trim() || !phoneInput.value.trim()) {
        alert('Please fill in all fields');
        return;
    }

    // Store form data
    formData.name = nameInput.value.trim();
    formData.phone = phoneInput.value.trim();

    // Log this lead
    logAnalytics('lead_captured', {
        modelId: formData.modelId,
        name: formData.name,
        phone: formData.phone
    });

    // Send to backend and require it to succeed before continuing
    const leadSaved = await sendLeadToBackend(formData);
    if (!leadSaved) {
        return;
    }

    // If there are no venues available, show the no-venues message or events if available
    if (!VENUES || VENUES.length === 0) {
        if (EVENTS && EVENTS.length > 0) {
            showVenuePortal();
            return;
        }
        showNoVenuesMessage();
        return;
    }

    // Show venue portal
    showVenuePortal();
}

// Fetch venues from backend
async function loadVenues() {
    try {
        const res = await fetch('/api/admin/venues');
        const data = await res.json();
        if (data.length > 0) {
            VENUES = data;
        }
    } catch (e) {
        console.warn('Could not load venues from backend, using defaults');
    }
    // If backend returns none, leave VENUES empty so UX can inform users
}

async function loadEvents() {
    try {
        const res = await fetch('/api/admin/events');
        if (!res.ok) throw new Error(`Events request failed: ${res.status}`);
        const events = await res.json();
        if (events.length > 0) {
            EVENTS = events;
        }
    } catch (e) {
        console.warn('Could not load events from backend', e);
        EVENTS = [];
    }
}

// Show the no-venues message UI
function showNoVenuesMessage() {
    // Switch sections
    document.getElementById('captureForm').classList.remove('active');
    const section = document.getElementById('noVenuesSection');
    if (section) section.style.display = 'block';
    document.getElementById('eventSection').classList.add('hidden');

    // Personalize heading
    const wrapper = document.querySelector('#noVenuesSection .no-venues-wrapper');
    if (wrapper) {
        const h2 = wrapper.querySelector('h2');
        if (h2) {
            // Prefer the user's first name. Don't show placeholder/test values.
            const rawName = (formData.name || '').trim();
            let first = rawName.split(' ')[0] || '';
            if (!first || /test/i.test(first) || /^test-model/i.test(first)) {
                // Try to clean the full name of test markers
                const cleaned = rawName.replace(/test-model-[\w-]+/ig, '').replace(/test/ig, '').trim();
                first = cleaned.split(' ')[0] || '';
            }
            if (!first) first = 'friend';
            h2.textContent = `Thanks ${first} — you're on the list!`;
        }
    }

    // Bind Done button
    const doneBtn = document.getElementById('noVenuesDone');
    if (doneBtn && !doneBtn._bound) {
        doneBtn.addEventListener('click', () => {
            document.getElementById('noVenuesSection').style.display = 'none';
            resetToForm();
        });
        doneBtn._bound = true;
    }
}

function renderEventList() {
    const section = document.getElementById('eventSection');
    const eventList = document.getElementById('eventList');

    if (!EVENTS || EVENTS.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    eventList.innerHTML = EVENTS.map(event => `
        <div class="event-card">
            ${event.image ? `<img src="${event.image}" alt="${event.title || event.name}" class="event-image"/>` : ''}
            <h4>${event.title || event.name}</h4>
            <p>${event.description || 'No description available.'}</p>
            <p><strong>Date:</strong> ${event.date || 'TBA'}</p>
            <p><strong>Location:</strong> ${event.location || 'TBA'}</p>
            <button class="btn btn-primary rsvp-btn" data-event-id="${event.id}">I'm going</button>
        </div>
    `).join('');

    // Bind RSVP buttons
    document.querySelectorAll('.rsvp-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const eventId = btn.dataset.eventId;
            try {
                const res = await fetch(`/api/events/${eventId}/rsvp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: formData.name, phone: formData.phone })
                });
                if (res.ok) {
                    alert('You are confirmed for this event — see you there!');
                } else {
                    const t = await res.text();
                    console.error('RSVP failed', res.status, t);
                    alert('Unable to RSVP right now. Please try again later.');
                }
            } catch (e) { console.error('RSVP error', e); alert('Unable to RSVP right now.'); }
        });
    });
}


// Register service worker and subscribe for push notifications
async function registerServiceWorkerAndSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        // get public key
        const res = await fetch('/api/public-vapid-key');
        if (!res.ok) throw new Error('Public VAPID key not available');
        const { publicKey } = await res.json();

        const convertedVapidKey = urlBase64ToUint8Array(publicKey);
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
        });

        // send subscription to backend
        await fetch('/api/subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription })
        });
    } catch (e) {
        console.warn('Failed to subscribe to push', e);
    }
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
// Verify key backend endpoints are reachable and log status
async function verifyBackendEndpoints() {
    try {
        const endpoints = ['/api/admin/venues', '/api/admin/stats'];
        for (const ep of endpoints) {
            try {
                const res = await fetch(ep);
                if (res.ok) {
                    console.log(`✅ Backend reachable: ${ep}`);
                } else {
                    console.warn(`⚠️ Backend endpoint returned ${res.status}: ${ep}`);
                }
            } catch (e) {
                console.warn(`❌ Backend unreachable: ${ep}`, e);
            }
        }
    } catch (e) {
        console.error('Error verifying backend endpoints', e);
    }
}

// Send lead data to backend
async function sendLeadToBackend(data) {
    try {
        const response = await fetch('/api/leads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: data.name,
                phone: data.phone,
                modelId: data.modelId,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const body = await response.text();
            setFormError('Unable to save your info. Please try again.');
            console.error('Failed to send lead to backend:', response.status, body);
            return false;
        }

        clearFormError();
        return true;
    } catch (error) {
        setFormError('Unable to save your info. Please check your connection and try again.');
        console.error('Error sending lead to backend:', error);
        return false;
    }
}

// Show venue portal
function showVenuePortal() {
    // Update display
    document.getElementById('displayName').textContent = formData.name.split(' ')[0];

    // Render venue cards and events
    renderVenueList();
    renderEventList();

    // Switch sections
    document.getElementById('captureForm').classList.remove('active');
    document.getElementById('venuePortal').classList.add('active');
}

// Render venue list
function renderVenueList() {
    const venueList = document.getElementById('venueList');
    venueList.innerHTML = '';

    VENUES.forEach(venue => {
        const card = document.createElement('div');
        card.className = 'venue-card';
        card.innerHTML = `
            <div class="venue-info">
                <h3>${venue.icon} ${venue.name}</h3>
                <p class="venue-offer">${venue.offer}</p>
            </div>
            <button class="btn btn-primary claim-btn" data-venue-id="${venue.id}">
                Claim Now
            </button>
        `;
        venueList.appendChild(card);
    });
}

// Handle venue selection
async function handleVenueSelection(venueId) {
    const venue = VENUES.find(v => v.id === venueId);
    if (!venue) return;

    formData.selectedVenue = venue;

    // Log selection
    logAnalytics('venue_selected', {
        modelId: formData.modelId,
        venueId: venue.id,
        venueName: venue.name,
        phone: formData.phone
    });

    // Show loading
    showLoadingSpinner();

    try {
        const backendResult = await processPassGeneration(venue);
        showPassGenerated(venue, backendResult);
    } catch (e) {
        console.error('Pass generation failed:', e);
        setFormError('Unable to complete your VIP pass right now. Please try again later.');
    } finally {
        hideLoadingSpinner();
    }
}

// Process pass generation
async function processPassGeneration(venue) {
    // Try calling the backend /api/passes endpoint.
    try {
        const res = await fetch('/api/passes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: formData.phone, venueId: venue.id, modelId: formData.modelId })
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Pass endpoint returned ${res.status}: ${body}`);
        }

        const json = await res.json();
        return {
            passCode: json.passCode,
            qrCodeUrl: json.qrCodeUrl
        };
    } catch (e) {
        console.error('Backend /api/passes failed:', e);
        throw e;
    }
}

// Show pass generated screen
function showPassGenerated(venue, backendResult = null) {
    // Choose passCode from backend if available
    const passCode = backendResult && backendResult.passCode ? backendResult.passCode : generatePassCode();

    // Update display
    document.getElementById('displayPhone').textContent = formData.phone;
    document.getElementById('selectedVenue').textContent = venue.name;
    document.getElementById('selectedOffer').textContent = venue.offer;
    document.getElementById('passCode').textContent = passCode;

    // Generate QR code (use backend-provided URL if present)
    if (backendResult && backendResult.qrCodeUrl) {
        const qrContainer = document.getElementById('qrCode');
        qrContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = backendResult.qrCodeUrl;
        img.alt = 'VIP Pass QR Code';
        qrContainer.appendChild(img);
    } else {
        generateQRCode(passCode, venue.id);
    }

    // Switch sections
    document.getElementById('venuePortal').classList.remove('active');
    document.getElementById('passGenerated').classList.add('active');
}

// Generate unique pass code
function generatePassCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Generate QR code
function generateQRCode(passCode, venueId) {
    const qrContainer = document.getElementById('qrCode');
    qrContainer.innerHTML = '';

    // QR Code links to verification page
    // Format: https://wett.vip/verify/[PASSCODE]
    const verifyUrl = `${window.location.origin}/verify/${passCode}`;
    const qrData = encodeURIComponent(verifyUrl);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${qrData}`;

    const img = document.createElement('img');
    img.src = qrUrl;
    img.alt = 'VIP Pass QR Code';
    qrContainer.appendChild(img);

    // Log pass generation
    logAnalytics('pass_generated', {
        modelId: formData.modelId,
        venueId: venueId,
        passCode: passCode,
        phone: formData.phone
    });
}

// UI State Management
function showLoadingSpinner() {
    document.getElementById('loadingSpinner').classList.add('active');
}

function setFormError(message) {
    let errorEl = document.getElementById('formError');
    if (!errorEl) {
        const form = document.getElementById('dataForm');
        errorEl = document.createElement('div');
        errorEl.id = 'formError';
        errorEl.className = 'form-error';
        form.parentNode.insertBefore(errorEl, form.nextSibling);
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function clearFormError() {
    const errorEl = document.getElementById('formError');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}

function hideLoadingSpinner() {
    document.getElementById('loadingSpinner').classList.remove('active');
}

function resetToForm() {
    // Clear form
    document.getElementById('dataForm').reset();
    formData.selectedVenue = null;

    // Switch sections
    document.getElementById('venuePortal').classList.remove('active');
    document.getElementById('captureForm').classList.add('active');

    logAnalytics('user_reset');
}

function resetToVenues() {
    formData.selectedVenue = null;
    
    // Switch sections
    document.getElementById('passGenerated').classList.remove('active');
    document.getElementById('venuePortal').classList.add('active');

    logAnalytics('claim_another');
}

function completedFlow() {
    logAnalytics('flow_completed', {
        modelId: formData.modelId,
        phone: formData.phone,
        totalVenuesClaimed: 1 // Could track multiple claims
    });

    // Could redirect or show thank you message
    alert('Thank you! Show your pass at the door. Check your texts for more VIP offers! 🎉');
    resetToForm();
}

// Analytics / Logging
function logAnalytics(event, data = {}) {
    const analyticsData = {
        event: event,
        timestamp: new Date().toISOString(),
        modelId: formData.modelId,
        ...data
    };

    console.log('📊 Analytics:', analyticsData);

    // Send to backend analytics endpoint
    // fetch('/api/analytics', { method: 'POST', body: JSON.stringify(analyticsData) });
    
    // Or send to Google Analytics / Mixpanel / etc
    if (window.gtag) {
        window.gtag('event', event, analyticsData);
    }
}

