// Venue data loaded from backend
let VENUE_MAP = {};

// Initialize verification on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Load venues from backend
    try {
        const res = await fetch('/api/admin/venues');
        const venueList = await res.json();
        venueList.forEach(v => { VENUE_MAP[v.id] = { name: v.name, offer: v.offer, address: v.address }; });
    } catch (e) {
        console.warn('Could not load venues');
    }

    const passCode = extractPassCodeFromURL();
    if (passCode) {
        verifyPass(passCode);
    } else {
        showInvalidState('No pass code provided');
    }
});

// Extract pass code from URL: /verify/ABC12345
function extractPassCodeFromURL() {
    const pathSegments = window.location.pathname.split('/');
    const verifyIndex = pathSegments.indexOf('verify');
    
    if (verifyIndex !== -1 && pathSegments[verifyIndex + 1]) {
        return pathSegments[verifyIndex + 1];
    }
    
    return null;
}

// Verify pass with backend
async function verifyPass(passCode) {
    try {
        console.log('Verifying pass:', passCode);

        // Call backend verification API
        const response = await fetch('/api/verify-pass', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                passCode: passCode,
                // Venue ID could be extracted from URL or passed separately
                // For now, verification works across all venues
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Check if pass already used
            if (data.message && data.message.includes('already redeemed')) {
                showUsedState(data);
            } else {
                showInvalidState(data.message || 'Invalid pass');
            }
            return;
        }

        // Pass is valid
        showValidState(passCode, data);

    } catch (error) {
        console.error('Verification error:', error);
        showInvalidState('Connection error. Check with manager.');
    }
}

// Show valid pass state
function showValidState(passCode, data) {
    const venueInfo = VENUE_MAP[data.venue] || {};
    
    document.getElementById('passCodeDisplay').textContent = passCode;
    document.getElementById('venueDisplay').textContent = venueInfo.name || data.venue;
    document.getElementById('offerDisplay').textContent = venueInfo.offer || 'VIP Offer';
    document.getElementById('phoneDisplay').textContent = data.phone || 'Not provided';
    
    // Hide loading, show valid state
    hideAllStates();
    document.getElementById('validState').classList.add('active');
    
    // Setup confirm button
    document.getElementById('confirmBtn').onclick = () => confirmEntry(passCode, data.venue);
}

// Confirm entry and mark pass as used
async function confirmEntry(passCode, venueId) {
    try {
        const response = await fetch('/api/confirm-entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                passCode: passCode,
                venueId: venueId,
                confirmedAt: new Date().toISOString()
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showInvalidState('Failed to confirm entry');
            return;
        }

        showSuccessState(data);

    } catch (error) {
        console.error('Confirmation error:', error);
        showInvalidState('Failed to confirm entry');
    }
}

// Show invalid pass state
function showInvalidState(message) {
    hideAllStates();
    document.getElementById('invalidState').classList.add('active');
    document.getElementById('errorMessageDisplay').textContent = message || 'This pass is not valid.';
}

// Show already used state
function showUsedState(data) {
    const venueInfo = VENUE_MAP[data.venue] || {};
    
    hideAllStates();
    document.getElementById('usedState').classList.add('active');
    
    if (data.redeemedAt) {
        document.getElementById('usedTimeDisplay').textContent = 
            new Date(data.redeemedAt).toLocaleString();
    }
    
    document.getElementById('usedVenueDisplay').textContent = venueInfo.name || data.venue;
}

// Show success confirmation state
function showSuccessState(data) {
    hideAllStates();
    document.getElementById('successState').classList.add('active');
    
    document.getElementById('successNameDisplay').textContent = data.customerName || 'Guest';
    document.getElementById('successTimeDisplay').textContent = 
        new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
}

// Hide all states
function hideAllStates() {
    document.getElementById('loadingState').classList.remove('active');
    document.getElementById('validState').classList.remove('active');
    document.getElementById('invalidState').classList.remove('active');
    document.getElementById('usedState').classList.remove('active');
    document.getElementById('successState').classList.remove('active');
}

// Simulate backend response (for testing without backend)
function simulateVerification(passCode) {
    setTimeout(() => {
        if (passCode === 'TEST123') {
            showValidState(passCode, {
                venue: 'wolf-den',
                phone: '(555) 123-4567',
                message: 'Valid pass'
            });
        } else {
            showInvalidState('Pass not found');
        }
    }, 1500);
}
