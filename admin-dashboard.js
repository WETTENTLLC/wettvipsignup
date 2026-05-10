// Admin Dashboard JavaScript

// State management
let venues = [];
let models = [];
let passes = [];
let stats = {};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    setupEventListeners();
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
    
    // Model name auto-update URL
    document.getElementById('modelName').addEventListener('input', function() {
        const url = `https://wett.vip/tag/${this.value}`;
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
}

// Load dashboard data
async function loadDashboardData() {
    try {
        // Fetch stats
        const statsRes = await fetch('/api/admin/stats');
        stats = await statsRes.json();
        
        // Update stats display
        document.getElementById('totalLeads').textContent = stats.totalLeads || 0;
        document.getElementById('totalPasses').textContent = stats.totalPasses || 0;
        document.getElementById('redeemedPasses').textContent = 
            Object.values(stats.venueStats || {}).reduce((sum, v) => sum + (v.redeemed || 0), 0);
        document.getElementById('monthlyRevenue').textContent = 
            '$' + (Object.values(stats.venueStats || {}).reduce((sum, v) => sum + (v.redeemed * 2.50), 0)).toFixed(2);

        // Load venues
        await loadVenues();
        
        // Load models
        await loadModels();
        
        // Load passes
        await loadPasses();
        
        // Update analytics
        updateAnalytics();

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// ============ VENUE MANAGEMENT ============

async function loadVenues() {
    try {
        const res = await fetch('/api/admin/venues');
        venues = await res.json();
        renderVenuesList();
    } catch (error) {
        console.error('Error loading venues:', error);
        renderVenuesList();
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
                <button class="btn btn-secondary btn-small" onclick="openVenueForm('${venue.id}')">Edit</button>
                <button class="btn btn-danger btn-small" onclick="deleteVenue('${venue.id}')">Delete</button>
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
        const response = await fetch('/api/admin/venues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(venue)
        });

        if (response.ok) {
            closeVenueForm();
            loadVenues();
            alert('Venue saved successfully!');
        }
    } catch (error) {
        console.error('Error saving venue:', error);
        alert('Error saving venue');
    }
}

async function deleteVenue(venueId) {
    if (!confirm('Are you sure you want to delete this venue?')) return;

    try {
        await fetch(`/api/admin/venues/${venueId}`, { method: 'DELETE' });
        loadVenues();
    } catch (error) {
        console.error('Error deleting venue:', error);
    }
}

// ============ MODEL MANAGEMENT ============

async function loadModels() {
    try {
        const res = await fetch('/api/admin/models');
        models = await res.json();
        renderModelsList();
    } catch (error) {
        console.error('Error loading models:', error);
        renderModelsList();
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
                <p><strong>URL:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">wett.vip/tag/${model.name}</code></p>
                <p><strong>Stats:</strong> ${totalTaps} taps → ${conversions} passes (${conversionRate}% conversion)</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-secondary btn-small" onclick="copyModelUrl('${model.name}')">Copy URL</button>
                <button class="btn btn-secondary btn-small" onclick="openModelForm('${model.id}')">Edit</button>
                <button class="btn btn-danger btn-small" onclick="deleteModel('${model.id}')">Delete</button>
            </div>
        </div>
    `;
    }).join('');
}

function openModelForm(modelId) {
    const form = document.getElementById('modelForm');
    const formElement = document.getElementById('modelFormElement');
    
    if (modelId === 'new') {
        document.getElementById('modelFormTitle').textContent = 'Create NFC Model';
        formElement.reset();
        formElement.dataset.modelId = '';
        document.getElementById('modelUrl').textContent = 'https://wett.vip/tag/model-name';
    } else {
        const model = models.find(m => m.id === modelId);
        if (model) {
            document.getElementById('modelFormTitle').textContent = 'Edit Model';
            document.getElementById('modelName').value = model.name;
            document.getElementById('modelDescription').value = model.description || '';
            document.getElementById('modelLocation').value = model.location || '';
            document.getElementById('modelUrl').textContent = `https://wett.vip/tag/${model.name}`;
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
        location: document.getElementById('modelLocation').value
    };

    if (!model.name || model.name.length === 0) {
        alert('Model name is required');
        return;
    }

    try {
        const response = await fetch('/api/admin/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(model)
        });

        if (response.ok) {
            closeModelForm();
            loadModels();
            alert(`Model created!\n\nURL to program: https://wett.vip/tag/${model.name}`);
        }
    } catch (error) {
        console.error('Error saving model:', error);
        alert('Error saving model');
    }
}

async function deleteModel(modelId) {
    if (!confirm('Are you sure you want to delete this model?')) return;

    try {
        await fetch(`/api/admin/models/${modelId}`, { method: 'DELETE' });
        loadModels();
    } catch (error) {
        console.error('Error deleting model:', error);
    }
}

function copyModelUrl(modelName) {
    const url = `https://wett.vip/tag/${modelName}`;
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
        const res = await fetch('/api/admin/passes');
        passes = await res.json();
        renderPassesList(passes);
    } catch (error) {
        console.error('Error loading passes:', error);
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
            <td>${pass.venueId}</td>
            <td>${new Date(pass.createdAt).toLocaleDateString()}</td>
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
