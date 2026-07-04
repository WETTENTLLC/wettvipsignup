// Admin Dashboard JavaScript

// State management
let venues = [];
let models = [];
let passes = [];
let stats = {};
let backendAvailable = false;

function setBackendStatus(isAvailable) {
    backendAvailable = isAvailable;
    const banner = document.getElementById('backendStatusBanner');
    if (!banner) return;

    banner.classList.add('visible');
    banner.classList.remove('online', 'offline', 'backend-banner-hidden');

    if (isAvailable) {
        banner.classList.add('online');
        banner.classList.remove('offline');
        banner.innerHTML = '<strong>Backend status:</strong> Connected. Your models and venues are being saved to the server.';
    } else {
        banner.classList.add('offline');
        banner.classList.remove('online');
        banner.innerHTML = '<strong>Backend status:</strong> Offline. Live data is unavailable and changes are not being saved.';
    }
}

function showLoginOverlay(message) {
    const overlay = document.getElementById('adminLoginOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    if (message) {
        const note = overlay.querySelector('.login-note');
        if (note) note.textContent = message;
    }
}

function hideLoginOverlay() {
    const overlay = document.getElementById('adminLoginOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
}

async function adminFetch(path, options = {}) {
    const res = await fetch(path, {
        credentials: 'same-origin',
        ...options,
    });
    if (res.status === 401) {
        showLoginOverlay('Your admin session has expired. Please log in again.');
        throw new Error('Unauthorized');
    }
    return res;
}

async function loadStats() {
    try {
        const res = await adminFetch('/api/admin/stats');
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Stats request failed: ${res.status}`);
        }
        stats = await res.json();
        document.getElementById('totalLeads').textContent = stats.totalLeads || 0;
        document.getElementById('totalPasses').textContent = stats.totalPasses || 0;
        document.getElementById('redeemedPasses').textContent = (stats.venueStats
            ? Object.values(stats.venueStats).reduce((sum, item) => sum + (item.redeemed || 0), 0)
            : 0);
        document.getElementById('monthlyRevenue').textContent = '$' + ((stats.totalPasses || 0) * 2.5).toFixed(2);
        setBackendStatus(true);
        updateAnalytics();
    } catch (error) {
        console.error('Unable to load admin stats:', error);
        stats = {};
        setBackendStatus(false);
        if (error.message === 'Unauthorized') return;
    }
}

async function loadDashboardData() {
    hideLoginOverlay();
    await Promise.allSettled([
        loadStats(),
        loadVenues(),
        loadModels(),
        loadPasses(),
        loadEventsAdmin()
    ]);
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    setupEventListeners();

    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('adminLoginUser').value.trim();
            const password = document.getElementById('adminLoginPassword').value;
            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ username, password })
                });
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    throw new Error(errBody.error || 'Login failed');
                }
                hideLoginOverlay();
                await loadDashboardData();
                alert('Login successful. Dashboard data is now available.');
            } catch (err) {
                console.error('Admin login failed', err);
                alert(err.message || 'Unable to log in');
            }
        });
    }
});

// Setup event listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            switchSection(this.dataset.section);
        });
    });

    // Venue form
    document.getElementById('venueFormElement').addEventListener('submit', handleVenueSubmit);
    
    // Model form
    document.getElementById('modelFormElement').addEventListener('submit', handleModelSubmit);

    // Event form
    const ef = document.getElementById('eventFormElement');
    if (ef) ef.addEventListener('submit', async function(e) {
        e.preventDefault();
        const title = document.getElementById('eventTitle').value.trim();
        const fileInput = document.getElementById('eventImageFile');
        const imageFile = fileInput && fileInput.files && fileInput.files[0];
        const description = document.getElementById('eventDesc').value.trim();
        const date = document.getElementById('eventDate').value ? new Date(document.getElementById('eventDate').value).toISOString() : new Date().toISOString();

        if (!title) return alert('Title is required');

        try {
            let imageData = '';
            if (imageFile) {
                imageData = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error('Unable to read image file'));
                    reader.readAsDataURL(imageFile);
                });
            }

            const res = await adminFetch('/api/admin/events', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, imageData, description, date })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || 'Failed to create event');
            }
            closeEventForm();
            await loadEventsAdmin();
            alert('Event created and notifications sent');
        } catch (err) {
            console.error('Create event failed', err);
            alert(err.message || 'Unable to create event');
        }
    });
    
    // Model name auto-update URL
    document.getElementById('modelName').addEventListener('input', function() {
        const url = `${window.location.origin}/tag/${this.value}`;
        document.getElementById('modelUrl').textContent = url;
    });

    // Analytics filters
    document.getElementById('modelFilterInput').addEventListener('input', filterAnalytics);
    document.getElementById('timeRangeSelect').addEventListener('change', filterAnalytics);

    // Passes filter
    document.getElementById('passFilterInput').addEventListener('input', filterPasses);
    document.getElementById('passStatusSelect').addEventListener('change', filterPasses);

    // Logout
    document.querySelector('.btn-logout').addEventListener('click', logout);

    // Global click delegation for dashboard buttons
    document.body.addEventListener('click', function(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const payload = target.dataset.payload;
        switch (action) {
            case 'switch-section':
                switchSection(payload);
                break;
            case 'open-venue-form':
                openVenueForm(payload);
                break;
            case 'close-venue-form':
                closeVenueForm();
                break;
            case 'open-model-form':
                openModelForm(payload);
                break;
            case 'close-model-form':
                closeModelForm();
                break;
            case 'copy-model-url':
                copyModelUrl(payload);
                break;
            case 'delete-venue':
                deleteVenue(payload);
                break;
            case 'delete-model':
                deleteModel(payload);
                break;
            case 'open-event-form':
                openEventForm(payload);
                break;
            case 'close-event-form':
                closeEventForm();
                break;
            case 'delete-event':
                deleteEvent(payload);
                break;
            default:
                break;
        }
    });
}

// ============ EVENTS (Admin) ============
async function loadEventsAdmin() {
    try {
        const res = await adminFetch('/api/admin/events');
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Events request failed: ${res.status}`);
        }
        const evs = await res.json();
        renderEventsAdmin(evs);
        setBackendStatus(true);
    } catch (e) {
        console.error('Unable to load events from backend:', e);
        renderEventsAdmin([]);
        setBackendStatus(false);
        if (e.message === 'Unauthorized') return;
    }
}

function renderEventsAdmin(evs) {
    const container = document.getElementById('eventsList');
    if (!evs || evs.length === 0) {
        container.innerHTML = '<p class="empty-state">No events yet. Create one to notify your customers.</p>';
        return;
    }

    container.innerHTML = evs.map(ev => `
        <div class="item-card">
            ${ev.image ? `<img src="${ev.image}" class="event-thumb"/>` : ''}
            <div class="item-info">
                <h3>${ev.title}</h3>
                <p>${ev.description || ''}</p>
                <p><strong>Date:</strong> ${ev.date}</p>
                <p><strong>Attendees:</strong> ${ (ev.attendees && ev.attendees.length) || 0 }</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-danger btn-small" data-action="delete-event" data-payload="${ev.id}">Delete</button>
            </div>
        </div>
    `).join('');
}

function openEventForm(id) {
    const form = document.getElementById('eventForm');
    const el = document.getElementById('eventFormElement');
    if (id === 'new') {
        el.reset();
        el.dataset.eventId = '';
    }
    form.classList.remove('hidden');
}

function closeEventForm() {
    document.getElementById('eventForm').classList.add('hidden');
}


// ============ VENUE MANAGEMENT ============

async function loadVenues() {
    try {
        const res = await adminFetch('/api/admin/venues');
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Venues request failed: ${res.status}`);
        }
        venues = await res.json();
        renderVenuesList();
        setBackendStatus(true);
    } catch (error) {
        console.error('Unable to load live venues from backend:', error);
        venues = [];
        renderVenuesList();
        setBackendStatus(false);
        if (error.message === 'Unauthorized') return;
    }
}

function renderVenuesList() {
    const container = document.getElementById('venuesList');
    
    if (venues.length === 0) {
        container.innerHTML = '<p class="empty-state">No venues yet. Create one to get started!</p>';
        return;
    }

    container.innerHTML = venues.map(venue => `
        <div class="item-card">
            <div class="item-info">
                <h3>${venue.icon} ${venue.name}</h3>
                <p>${venue.address}</p>
                <p><strong>Offer:</strong> ${venue.offer}</p>
                <p><strong>WETT Fee:</strong> $${venue.fee.toFixed(2)} per pass</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-secondary btn-small" data-action="open-venue-form" data-payload="${venue.id}">Edit</button>
                <button class="btn btn-danger btn-small" data-action="delete-venue" data-payload="${venue.id}">Delete</button>
            </div>
        </div>
    `).join('');
}

function openVenueForm(venueId) {
    const form = document.getElementById('venueForm');
    const formElement = document.getElementById('venueFormElement');
    
    if (venueId === 'new') {
        document.getElementById('venueFormTitle').textContent = 'Add New Venue';
        formElement.reset();
        formElement.dataset.venueId = '';
    } else {
        const venue = venues.find(v => v.id === venueId);
        if (venue) {
            document.getElementById('venueFormTitle').textContent = 'Edit Venue';
            document.getElementById('venueName').value = venue.name;
            document.getElementById('venueAddress').value = venue.address;
            document.getElementById('venueOffer').value = venue.offer;
            document.getElementById('venueIcon').value = venue.icon;
            document.getElementById('venueFee').value = venue.fee;
            formElement.dataset.venueId = venueId;
        }
    }
    
    form.classList.remove('hidden');
}

function closeVenueForm() {
    document.getElementById('venueForm').classList.add('hidden');
}

async function handleVenueSubmit(e) {
    e.preventDefault();

    const venue = {
        name: document.getElementById('venueName').value,
        address: document.getElementById('venueAddress').value,
        offer: document.getElementById('venueOffer').value,
        icon: document.getElementById('venueIcon').value || '🎭',
        fee: parseFloat(document.getElementById('venueFee').value)
    };

    try {
        const response = await adminFetch('/api/admin/venues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(venue)
        });

        if (response.ok) {
            closeVenueForm();
            await loadVenues();
            alert('Venue saved successfully!');
            return;
        }
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Venue API returned ${response.status}`);
    } catch (error) {
        console.error('Unable to save venue to backend:', error);
        setBackendStatus(false);
        alert('Unable to save venue. Please make sure the backend is running and try again.');
    }
}

async function deleteVenue(venueId) {
    if (!confirm('Are you sure you want to delete this venue?')) return;

    try {
        const res = await adminFetch(`/api/admin/venues/${venueId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Delete venue failed: ${res.status}`);
        await loadVenues();
        return;
    } catch (error) {
        console.error('Unable to delete venue from backend:', error);
        setBackendStatus(false);
        alert('Unable to delete venue. Please make sure the backend is running and try again.');
    }
}

// ============ MODEL MANAGEMENT ============

async function loadModels() {
    try {
        const res = await adminFetch('/api/admin/models');
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Models request failed: ${res.status}`);
        }
        models = await res.json();
        renderModelsList();
        setBackendStatus(true);
    } catch (error) {
        console.error('Unable to load live models from backend:', error);
        models = [];
        renderModelsList();
        setBackendStatus(false);
        if (error.message === 'Unauthorized') return;
    }
}

function renderModelsList() {
    const container = document.getElementById('modelsList');
    
    if (models.length === 0) {
        container.innerHTML = '<p class="empty-state">No models yet. Create one to get started!</p>';
        return;
    }

    container.innerHTML = models.map(model => {
        const totalTaps = model.totalTaps || 0;
        const conversions = model.conversions || 0;
        const conversionRate = totalTaps > 0 ? ((conversions / totalTaps) * 100).toFixed(1) : 0;
        
        return `
        <div class="item-card">
            <div class="item-info">
                <h3>🏷️ ${model.name}</h3>
                <p>${model.description || 'No description'}</p>
                <p><strong>Location:</strong> ${model.location || 'Not specified'}</p>
                <p><strong>URL:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;" class="model-url-display" data-model-name="${model.name}">/tag/${model.name}</code></p>
                <p><strong>Stats:</strong> ${totalTaps} taps → ${conversions} passes (${conversionRate}% conversion)</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-secondary btn-small" data-action="copy-model-url" data-payload="${model.name}">Copy URL</button>
                <button class="btn btn-secondary btn-small" data-action="open-model-form" data-payload="${model.id}">Edit</button>
                <button class="btn btn-danger btn-small" data-action="delete-model" data-payload="${model.id}">Delete</button>
            </div>
        </div>
    `;
    }).join('');
    
    // Update URL displays with current origin
    setTimeout(() => {
        document.querySelectorAll('.model-url-display').forEach(el => {
            const modelName = el.dataset.modelName;
            el.textContent = `${window.location.origin}/tag/${modelName}`;
        });
    }, 0);
}

function openModelForm(modelId) {
    const form = document.getElementById('modelForm');
    const formElement = document.getElementById('modelFormElement');
    
    if (modelId === 'new') {
        document.getElementById('modelFormTitle').textContent = 'Create NFC Model';
        formElement.reset();
        formElement.dataset.modelId = '';
        document.getElementById('modelUrl').textContent = `${window.location.origin}/tag/model-name`;
    } else {
        const model = models.find(m => m.id === modelId);
        if (model) {
            document.getElementById('modelFormTitle').textContent = 'Edit Model';
            document.getElementById('modelName').value = model.name;
            document.getElementById('modelDescription').value = model.description || '';
            document.getElementById('modelLocation').value = model.location || '';
            document.getElementById('modelUrl').textContent = `${window.location.origin}/tag/${model.name}`;
            formElement.dataset.modelId = modelId;
        }
    }
    
    form.classList.remove('hidden');
}

function closeModelForm() {
    document.getElementById('modelForm').classList.add('hidden');
}

async function handleModelSubmit(e) {
    e.preventDefault();

    const model = {
        name: document.getElementById('modelName').value.toLowerCase().replace(/\s+/g, '-'),
        description: document.getElementById('modelDescription').value,
        location: document.getElementById('modelLocation').value,
        totalTaps: 0,
        conversions: 0
    };

    if (!model.name || model.name.length === 0) {
        alert('Model name is required');
        return;
    }

    try {
        const response = await adminFetch('/api/admin/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(model)
        });

        if (response.ok) {
            closeModelForm();
            await loadModels();
            alert(`Model created!\n\nURL to program: ${window.location.origin}/tag/${model.name}`);
            return;
        }
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Models API returned ${response.status}`);
    } catch (error) {
        console.error('Unable to save model to backend:', error);
        setBackendStatus(false);
        alert('Unable to save model. Please make sure the backend is running and try again.');
    }
}

async function deleteModel(modelId) {
    if (!confirm('Are you sure you want to delete this model?')) return;

    try {
        const res = await adminFetch(`/api/admin/models/${modelId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Delete model failed: ${res.status}`);
        await loadModels();
        return;
    } catch (error) {
        console.error('Unable to delete model from backend:', error);
        setBackendStatus(false);
        alert('Unable to delete model. Please make sure the backend is running and try again.');
    }
}

function copyModelUrl(modelName) {
    const url = `${window.location.origin}/tag/${modelName}`;
    copyToClipboard(url);
    alert('URL copied: ' + url);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text || document.getElementById('modelUrl').textContent);
}

// ============ ANALYTICS ============

function updateAnalytics() {
    // Performance by model
    const performanceList = document.getElementById('modelPerformance');
    if (models.length === 0) {
        performanceList.innerHTML = '<p class="loading">No data yet</p>';
    } else {
        performanceList.innerHTML = models.map(model => {
            const totalTaps = model.totalTaps || 0;
            const conversions = model.conversions || 0;
            const rate = totalTaps > 0 ? ((conversions / totalTaps) * 100).toFixed(1) : 0;
            
            return `
            <div class="performance-item">
                <strong>${model.name}</strong>
                <div class="performance-stat">
                    <div>${totalTaps} <span>taps</span></div>
                    <div>${conversions} <span>passes</span></div>
                    <div>${rate}% <span>conversion</span></div>
                </div>
            </div>
            `;
        }).join('');
    }

    // Venue rankings
    const rankingsList = document.getElementById('venueRankings');
    if (Object.keys(stats.venueStats || {}).length === 0) {
        rankingsList.innerHTML = '<p class="loading">No data yet</p>';
    } else {
        rankingsList.innerHTML = Object.entries(stats.venueStats || {})
            .sort((a, b) => b[1].total - a[1].total)
            .map(([venueId, data]) => {
                const redemptionRate = data.total > 0 ? ((data.redeemed / data.total) * 100).toFixed(1) : 0;
                
                return `
                <div class="ranking-item">
                    <strong>${venueId}</strong>
                    <div class="performance-stat">
                        <div>${data.total} <span>generated</span></div>
                        <div>${data.redeemed} <span>redeemed</span></div>
                        <div>${redemptionRate}% <span>rate</span></div>
                    </div>
                </div>
                `;
            }).join('');
    }
}

function filterAnalytics() {
    updateAnalytics();
}

// ============ PASSES ============

async function loadPasses() {
    try {
        const res = await adminFetch('/api/admin/passes');
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `Passes request failed: ${res.status}`);
        }
        passes = await res.json();
        renderPassesList(passes);
    } catch (error) {
        console.error('Error loading passes:', error);
        passes = [];
        renderPassesList(passes);
        if (error.message === 'Unauthorized') return;
    }
}

function renderPassesList(data) {
    const tbody = document.getElementById('passesTableBody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No passes yet</td></tr>';
        return;
    }

    tbody.innerHTML = data.slice(0, 50).map(pass => `
        <tr>
            <td><code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${pass.passCode}</code></td>
            <td>${pass.phone}</td>
            <td>${pass.venueName || pass.venueId}</td>
            <td>${new Date(pass.createdAt || pass.timestamp).toLocaleDateString()}</td>
            <td><span class="status-badge status-${pass.used ? 'used' : 'active'}">${pass.used ? 'Redeemed' : 'Active'}</span></td>
            <td>${pass.redeemedAt ? new Date(pass.redeemedAt).toLocaleString() : '-'}</td>
        </tr>
    `).join('');
}

function filterPasses() {
    const filterText = document.getElementById('passFilterInput').value.toLowerCase();
    const statusFilter = document.getElementById('passStatusSelect').value;

    const filtered = passes.filter(pass => {
        const matchesText = pass.phone.includes(filterText) || pass.passCode.includes(filterText);
        const matchesStatus = statusFilter === 'all' || 
                            (statusFilter === 'active' && !pass.used) ||
                            (statusFilter === 'used' && pass.used);
        return matchesText && matchesStatus;
    });

    renderPassesList(filtered);
}

// ============ NAVIGATION ============

function switchSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    // Show selected section
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    // Update nav highlighting
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Reload data if needed
    if (sectionName === 'analytics') {
        updateAnalytics();
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/admin-login.html';
    }
}

// Auto-refresh data every 30 seconds
setInterval(loadDashboardData, 30000);
