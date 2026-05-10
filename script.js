// Venues loaded from backend (populated by admin dashboard)
let VENUES = [];

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
    await loadVenues();
    setupEventListeners();
    logAnalytics('page_loaded', { modelId: formData.modelId });
});

// Extract ModelID from URL (wett.vip/tag/[ModelID])
function extractModelIdFromURL() {
    const pathSegments = window.location.pathname.split('/');
    const tagIndex = pathSegments.indexOf('tag');
    
    if (tagIndex !== -1 && pathSegments[tagIndex + 1]) {
        formData.modelId = pathSegments[tagIndex + 1];
        console.log('Model ID extracted:', formData.modelId);
    } else {
        // Fallback for local testing
        formData.modelId = 'test-model-' + Math.random().toString(36).substr(2, 9);
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

    // Send to backend (optional)
    await sendLeadToBackend(formData);

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
    // Fallback if no venues in DB yet
    if (VENUES.length === 0) {
        VENUES = [
            { id: 'wolf-den', name: 'Wolf Den Bar & Grill', offer: 'Claim Free Drink Pass', icon: '🍺' }
        ];
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
            console.warn('Failed to send lead to backend:', response.status);
        }
    } catch (error) {
        console.warn('Error sending lead to backend:', error);
        // Continue anyway - don't block UX
    }
}

// Show venue portal
function showVenuePortal() {
    // Update display
    document.getElementById('displayName').textContent = formData.name.split(' ')[0];

    // Render venue cards
    renderVenueList();

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

    // Simulate backend processing (QR code generation, SMS sending)
    await processPassGeneration(venue);

    // Hide loading
    hideLoadingSpinner();

    // Show pass
    showPassGenerated(venue);
}

// Process pass generation
async function processPassGeneration(venue) {
    return new Promise((resolve) => {
        // Simulate backend processing time (500-1000ms)
        setTimeout(() => {
            // In production, this would call your backend API:
            // POST /api/passes with venue ID, phone, etc.
            // Backend would:
            // 1. Generate unique pass code
            // 2. Create QR code
            // 3. Send SMS
            
            resolve();
        }, 800);
    });
}

// Show pass generated screen
function showPassGenerated(venue) {
    // Generate unique pass code
    const passCode = generatePassCode();

    // Update display
    document.getElementById('displayPhone').textContent = formData.phone;
    document.getElementById('selectedVenue').textContent = venue.name;
    document.getElementById('selectedOffer').textContent = venue.offer;
    document.getElementById('passCode').textContent = passCode;

    // Generate QR code
    generateQRCode(passCode, venue.id);

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

// Test function (for development)
function testQRCode() {
    const testVenue = VENUES[0];
    showPassGenerated(testVenue);
}
