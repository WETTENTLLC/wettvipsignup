/**
 * WETT VIP Portal - Backend Example
 * 
 * This is a reference implementation for the backend APIs needed
 * to support the landing page. Built with Node.js + Express.
 * 
 * Install dependencies:
 * npm install express cors dotenv twilio qrcode
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const twilio = require('twilio');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'https:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: []
        }
    }
}));
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(__dirname));

// Session middleware (simple memory store for now). In production use a keyed store (Redis).
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/', apiLimiter);
app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
});

// Twilio setup (for SMS) - only init if credentials exist
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// Persistent JSON storage
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading data file:', e);
    }
    return { leads: [], passes: [], venues: [], models: [], events: [] };
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error('Error saving data file:', e);
    }
}

function sanitizeInput(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/[<>]/g, '');
}

const db = loadData();
const leads = db.leads;
const passes = db.passes;
const venues = db.venues;
const models = db.models;

// SPA route handling - serve index.html for /tag/:modelId and track tap
app.get('/tag/:modelId', (req, res) => {
    const model = models.find(m => m.name === req.params.modelId);
    if (model) { model.totalTaps++; saveData(); }
    res.sendFile(__dirname + '/index.html');
});

// Serve verify.html for /verify/:passCode
app.get('/verify/:passCode', (req, res) => {
    res.sendFile(__dirname + '/verify.html');
});

// ============================================
// 1. LEAD CAPTURE API
// ============================================

app.post('/api/leads', async (req, res) => {
    try {
        const name = sanitizeInput(req.body.name);
        const phone = sanitizeInput(req.body.phone);
        const modelId = sanitizeInput(req.body.modelId);
        const timestamp = sanitizeInput(req.body.timestamp);

        if (!name || !phone || !modelId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create lead record
        const lead = {
            id: `lead_${Date.now()}`,
            name,
            phone,
            modelId,
            timestamp: timestamp || new Date().toISOString(),
            status: 'captured'
        };

        // Save to database
        leads.push(lead);
        saveData();

        console.log('📋 Lead captured:', lead);

        res.json({
            success: true,
            leadId: lead.id,
            message: 'Lead recorded successfully'
        });

    } catch (error) {
        console.error('Error capturing lead:', error);
        res.status(500).json({ error: 'Failed to capture lead' });
    }
});

// ============================================
// 2. PASS GENERATION API (Main Logic)
// ============================================

app.post('/api/passes', async (req, res) => {
    try {
        const phone = sanitizeInput(req.body.phone);
        const venueId = sanitizeInput(req.body.venueId);
        const modelId = sanitizeInput(req.body.modelId);

        if (!phone || !venueId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate unique pass code
        const passCode = generatePassCode();

        // Generate QR code
        const qrCodeData = await generateQRCode(passCode, venueId);

        // Send SMS with pass
        await sendPassViaSMS(phone, passCode, venueId);

        // Track conversion on model
        const model = models.find(m => m.name === modelId);
        if (model) { model.conversions++; saveData(); }

        // Create pass record
        const pass = {
            id: `pass_${Date.now()}`,
            passCode,
            phone,
            venueId,
            venueName: getVenueName(venueId),
            modelId,
            createdAt: new Date().toISOString(),
            status: 'active',
            used: false
        };

        // Save to database
        passes.push(pass);
        saveData();

        console.log('✅ Pass generated:', pass);

        res.json({
            success: true,
            passCode,
            qrCodeUrl: qrCodeData,
            smsStatus: 'sent',
            message: `Pass sent to ${phone}`
        });

    } catch (error) {
        console.error('Error generating pass:', error);
        res.status(500).json({ error: 'Failed to generate pass' });
    }
});

// ============================================
// 3. ANALYTICS API
// ============================================

app.post('/api/analytics', async (req, res) => {
    try {
        const analyticsEvent = {
            ...req.body,
            recordedAt: new Date().toISOString()
        };

        console.log('📊 Analytics event:', analyticsEvent);

        // Send to analytics service (Google Analytics, Mixpanel, etc.)
        // await sendToAnalyticsService(analyticsEvent);

        res.json({ success: true });

    } catch (error) {
        console.error('Error recording analytics:', error);
        res.status(500).json({ error: 'Failed to record analytics' });
    }
});

// ============================================
// 4. PASS VERIFICATION API (For Door Scanners)
// ============================================

app.post('/api/verify-pass', async (req, res) => {
    try {
        const passCode = sanitizeInput(req.body.passCode);
        const venueId = sanitizeInput(req.body.venueId);

        if (!passCode) {
            return res.status(400).json({ valid: false, message: 'Pass code required' });
        }

        const pass = passes.find(p => p.passCode === passCode);

        if (!pass) {
            return res.status(404).json({ 
                valid: false, 
                message: 'Invalid or expired pass' 
            });
        }

        if (pass.used || pass.status === 'redeemed') {
            return res.status(400).json({ 
                valid: false, 
                message: 'This pass has already been redeemed. Customer needs a new pass.',
                redeemedAt: pass.redeemedAt,
                venue: pass.venueId
            });
        }

        console.log('✅ Pass verified (not yet redeemed):', pass);

        res.json({
            valid: true,
            passCode,
            venue: pass.venueId,
            phone: pass.phone,
            message: 'Pass is valid. Ready to confirm entry.'
        });

    } catch (error) {
        console.error('Error verifying pass:', error);
        res.status(500).json({ error: 'Failed to verify pass' });
    }
});

// ============================================
// 4B. CONFIRM ENTRY (Mark Pass as Used)
// ============================================

app.post('/api/confirm-entry', async (req, res) => {
    try {
        const passCode = sanitizeInput(req.body.passCode);
        const venueId = sanitizeInput(req.body.venueId);
        const confirmedAt = sanitizeInput(req.body.confirmedAt);

        if (!passCode || !venueId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const pass = passes.find(p => 
            p.passCode === passCode && 
            p.status === 'active'
        );

        if (!pass) {
            return res.status(404).json({ 
                error: 'Pass not found' 
            });
        }

        if (pass.used) {
            return res.status(400).json({ 
                error: 'This pass has already been redeemed. Customer needs a new pass for another visit.',
                redeemedAt: pass.redeemedAt
            });
        }

        // Mark as used - ONE pass = ONE use, no re-entry
        pass.used = true;
        pass.status = 'redeemed';
        pass.redeemedAt = confirmedAt || new Date().toISOString();
        saveData();

        console.log('🎉 Entry confirmed and pass BURNED:', pass);

        res.json({
            success: true,
            passCode,
            venueId: pass.venueId,
            customerName: pass.phone,
            redeemedAt: pass.redeemedAt,
            message: 'Customer checked in! Pass is now used up — they need a new one next time.'
        });

    } catch (error) {
        console.error('Error confirming entry:', error);
        res.status(500).json({ error: 'Failed to confirm entry' });
    }
});

    // ============================================
    // AUTH: Admin login + session middleware
    // ============================================

    // Admin login - accepts JSON { username, password }
    app.post('/api/admin/login', async (req, res) => {
        try {
            const username = sanitizeInput(req.body.username);
            const password = req.body.password; // raw for bcrypt

            if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

            const adminUser = process.env.ADMIN_USER || 'admin';
            const adminHash = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('password', 10);

            if (username !== adminUser) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const ok = await bcrypt.compare(password, adminHash);
            if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

            req.session.isAdmin = true;
            req.session.adminUser = adminUser;
            res.json({ success: true, message: 'Logged in' });
        } catch (err) {
            console.error('Login error', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    app.get('/api/admin/logout', (req, res) => {
        if (req.session) {
            req.session.destroy(() => {
                res.json({ success: true });
            });
        } else res.json({ success: true });
    });

    function requireAdmin(req, res, next) {
        if (req.session && req.session.isAdmin) return next();
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Protect admin routes declared after this point
    app.use('/api/admin', requireAdmin);

// ============================================
// 5. ADMIN DASHBOARD API
// ============================================

// Get leads by model ID (for A/B testing)
app.get('/api/admin/leads/:modelId', (req, res) => {
    const { modelId } = req.params;
    const modelLeads = leads.filter(l => l.modelId === modelId);

    res.json({
        modelId,
        totalLeads: modelLeads.length,
        leads: modelLeads
    });
});

// Get pass statistics
app.get('/api/admin/stats', (req, res) => {
    const venueStats = {};

    passes.forEach(pass => {
        if (!venueStats[pass.venueId]) {
            venueStats[pass.venueId] = {
                total: 0,
                redeemed: 0,
                pending: 0
            };
        }
        venueStats[pass.venueId].total++;
        if (pass.used) {
            venueStats[pass.venueId].redeemed++;
        } else {
            venueStats[pass.venueId].pending++;
        }
    });

    res.json({
        totalLeads: leads.length,
        totalPasses: passes.length,
        venueStats,
        timestamp: new Date().toISOString()
    });
});

// --- VENUES CRUD ---
app.get('/api/admin/venues', (req, res) => res.json(venues));

app.post('/api/admin/venues', (req, res) => {
    const name = sanitizeInput(req.body.name);
    const address = sanitizeInput(req.body.address);
    const offer = sanitizeInput(req.body.offer);
    const icon = sanitizeInput(req.body.icon);
    const fee = Number(req.body.fee);

    if (!name || !offer || Number.isNaN(fee)) {
        return res.status(400).json({ error: 'Missing or invalid fields' });
    }

    const venue = { id: name.toLowerCase().replace(/\s+/g, '-'), name, address, offer, icon: icon || '🎭', fee };
    const existing = venues.findIndex(v => v.id === venue.id);
    if (existing >= 0) venues[existing] = venue; else venues.push(venue);
    saveData();
    res.json(venue);
});

app.delete('/api/admin/venues/:id', (req, res) => {
    const idx = venues.findIndex(v => v.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    venues.splice(idx, 1);
    saveData();
    res.json({ success: true });
});

// --- MODELS CRUD ---
app.get('/api/admin/models', (req, res) => res.json(models));

app.post('/api/admin/models', (req, res) => {
    const name = sanitizeInput(req.body.name);
    const description = sanitizeInput(req.body.description);
    const location = sanitizeInput(req.body.location);

    if (!name) return res.status(400).json({ error: 'Name required' });
    const model = { id: `model_${Date.now()}`, name, description, location, totalTaps: 0, conversions: 0 };
    models.push(model);
    saveData();
    res.json(model);
});

app.delete('/api/admin/models/:id', (req, res) => {
    const idx = models.findIndex(m => m.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    models.splice(idx, 1);
    saveData();
    res.json({ success: true });
});

// --- PASSES LIST ---
app.get('/api/admin/passes', (req, res) => res.json(passes));

// --- EVENTS LIST ---
app.get('/api/admin/events', (req, res) => res.json(db.events || []));

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate unique pass code
 */
function generatePassCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Generate QR code
 */
async function generateQRCode(passCode, venueId) {
    try {
        // For production, generate QR code server-side and store
        // For now, return client-side QR URL
        const qrData = `pass=${passCode}&venue=${venueId}`;
        const qrCodeUrl = await QRCode.toDataURL(qrData);
        return qrCodeUrl;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
}

/**
 * Send pass via SMS
 */
async function sendPassViaSMS(phone, passCode, venueId) {
    const venue = venues.find(v => v.id === venueId);
    const venueName = venue ? venue.name : venueId;
    const venueOffer = venue ? venue.offer : 'VIP Pass';

    if (!twilioClient) {
        console.log(`📱 SMS skipped (Twilio not configured). Would send to ${phone}: ${venueName} - ${venueOffer} - Code: ${passCode}`);
        return null;
    }
    try {
        const message = await twilioClient.messages.create({
            body: `🎉 Your ${venueName} VIP Pass: ${passCode}\n\n${venueOffer}\n\nShow this code at the door!`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log(`📱 SMS sent to ${phone}:`, message.sid);
        return message;
    } catch (error) {
        console.error('Error sending SMS:', error);
    }
}

/**
 * Get venue name from live venues array
 */
function getVenueName(venueId) {
    const venue = venues.find(v => v.id === venueId);
    return venue ? venue.name : venueId;
}

// ============================================
// AUTOMATED RETENTION SMS (Runs periodically)
// ============================================

/**
 * Send retention SMS (run via cron job)
 * This sends follow-up messages to encourage repeat visits
 */
async function sendRetentionSMS() {
    try {
        const now = new Date();
        
        // Get leads from 3 days ago
        const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
        const recentLeads = leads.filter(l => 
            new Date(l.timestamp) > threeDaysAgo &&
            new Date(l.timestamp) < new Date(l.timestamp).setDate(new Date(l.timestamp).getDate() - 2)
        );

        for (const lead of recentLeads) {
            const message = `💝 You still have unused VIP passes! Check wett.vip to claim more. Limited time! 🎉`;
            
            await twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: lead.phone
            });

            console.log(`📱 Retention SMS sent to ${lead.phone}`);
        }

    } catch (error) {
        console.error('Error sending retention SMS:', error);
    }
}

// ============================================
// START SERVER
// ============================================

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
    🎉 WETT VIP Portal Backend Started
    ✅ Running on http://localhost:${PORT}
    
    API Endpoints:
    POST   /api/leads              - Capture customer info
    POST   /api/passes             - Generate pass + send SMS
    POST   /api/analytics          - Log events
    POST   /api/verify-pass        - Verify pass at door
    GET    /api/admin/leads/:modelId
    GET    /api/admin/stats
    `);
    });
}

module.exports = app;
