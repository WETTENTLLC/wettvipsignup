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
const webpush = require('web-push');
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
app.use(express.json({ limit: '2mb' }));
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
    message: { error: 'Too many requests, please try again later.' },
    skip: (req) => req.path.startsWith('/api/admin/') && req.session && req.session.isAdmin
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/admin/', adminLimiter);
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
const BACKUPS_DIR = path.join(__dirname, 'backups');

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
        // Ensure backups directory exists and write a timestamped backup
        try {
            fs.mkdirSync(BACKUPS_DIR, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUPS_DIR, `data-${stamp}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(db, null, 2));

            // Keep only the latest N backups
            const maxBackups = 50;
            const files = fs.readdirSync(BACKUPS_DIR)
                .filter(f => f.endsWith('.json'))
                .map(f => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
                .sort((a, b) => b.t - a.t);
            if (files.length > maxBackups) {
                files.slice(maxBackups).forEach(old => {
                    try { fs.unlinkSync(path.join(BACKUPS_DIR, old.f)); } catch (e) {}
                });
            }
        } catch (bkErr) {
            console.error('Error creating backup before save:', bkErr);
        }

        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error('Error saving data file:', e);
    }
}

function reloadData() {
    try {
        const newDb = loadData();
        // replace arrays in-place so references remain valid
        db.leads.length = 0; if (Array.isArray(newDb.leads)) db.leads.push(...newDb.leads);
        db.passes.length = 0; if (Array.isArray(newDb.passes)) db.passes.push(...newDb.passes);
        db.venues.length = 0; if (Array.isArray(newDb.venues)) db.venues.push(...newDb.venues);
        db.models.length = 0; if (Array.isArray(newDb.models)) db.models.push(...newDb.models);
        db.events = newDb.events || [];
        return true;
    } catch (e) {
        console.error('Error reloading data after restore:', e);
        return false;
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
db.subscriptions = db.subscriptions || [];
db.events = db.events || db.events || [];

// Web Push (VAPID) setup — prefer env vars, fall back to persisted keys in data.json,
// otherwise generate keys on first run and persist them so clients can subscribe.
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
if (!vapidPublicKey || !vapidPrivateKey) {
    if (db.vapid && db.vapid.publicKey && db.vapid.privateKey) {
        vapidPublicKey = db.vapid.publicKey;
        vapidPrivateKey = db.vapid.privateKey;
    } else {
        try {
            const keys = webpush.generateVAPIDKeys();
            vapidPublicKey = keys.publicKey;
            vapidPrivateKey = keys.privateKey;
            db.vapid = { publicKey: vapidPublicKey, privateKey: vapidPrivateKey };
            saveData();
            console.log('Generated new VAPID keys for Web Push.');
        } catch (e) {
            console.error('Failed generating VAPID keys', e);
        }
    }
}
if (vapidPublicKey && vapidPrivateKey) {
    try {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@wett.vip', vapidPublicKey, vapidPrivateKey);
    } catch (e) {
        console.error('Error setting VAPID details', e);
    }
}

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

// Public endpoint for clients to register a Web Push subscription
app.post('/api/subscribe', (req, res) => {
    try {
        const subscription = req.body && req.body.subscription;
        if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

        // avoid duplicates
        const exists = db.subscriptions.find(s => s.endpoint === subscription.endpoint);
        if (!exists) {
            db.subscriptions.push(subscription);
            saveData();
        }

        return res.json({ success: true, publicKey: vapidPublicKey });
    } catch (e) {
        console.error('Error saving subscription', e);
        res.status(500).json({ error: 'Failed to save subscription' });
    }
});

// Public: get VAPID public key for client registration
app.get('/api/public-vapid-key', (req, res) => {
    if (!vapidPublicKey) return res.status(500).json({ error: 'VAPID key not available' });
    res.json({ publicKey: vapidPublicKey });
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

    // Admin login - accepts JSON { username, password }.
    // Supports multiple sources for credentials to make deployments resilient:
    //  - process.env.ADMIN_PASSWORD_HASH (bcrypt hash)
    //  - process.env.ADMIN_PASSWORD (plaintext, convenient for quick deploys)
    //  - persisted `db.admin.hash` (one-time setup persisted to data.json)
    //  - ADMIN_SETUP_TOKEN + setupToken in body to create initial admin (one-time)
    app.post('/api/admin/login', async (req, res) => {
        try {
            const username = sanitizeInput(req.body.username);
            const password = req.body.password; // raw for bcrypt or plaintext compare

            if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

            const adminUser = process.env.ADMIN_USER || 'admin';

            if (username !== adminUser) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const envHash = process.env.ADMIN_PASSWORD_HASH;
            const envPlain = process.env.ADMIN_PASSWORD;
            const dbAdminHash = db.admin && db.admin.hash;

            let ok = false;

            if (envHash) {
                ok = await bcrypt.compare(password, envHash);
            } else if (envPlain) {
                // Allow quick plaintext env password for deployments where hashing isn't set up yet
                ok = password === envPlain;
            } else if (dbAdminHash) {
                ok = await bcrypt.compare(password, dbAdminHash);
            } else {
                // If no admin configured in env or DB, allow a one-time setup when a matching
                // ADMIN_SETUP_TOKEN is provided in the request body. This lets owners bootstrap
                // an admin account without changing source code. The created admin hash is
                // persisted to `data.json` so subsequent logins use the stored hash.
                const setupToken = process.env.ADMIN_SETUP_TOKEN;
                if (setupToken && req.body.setupToken && req.body.setupToken === setupToken) {
                    const hashed = bcrypt.hashSync(password, 10);
                    db.admin = { user: adminUser, hash: hashed, createdAt: new Date().toISOString() };
                    try { saveData(); } catch (e) { console.error('Failed saving admin setup to data file', e); }
                    ok = true;
                    console.log('Admin account created via one-time setup token');
                } else {
                    // Development fallback (keeps previous behaviour) — password == 'password'
                    ok = await bcrypt.compare(password, bcrypt.hashSync('password', 10));
                }
            }

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

// Admin: create an event and notify subscribers via Web Push (and optional SMS)
app.post('/api/admin/events', (req, res) => {
    try {
        const title = sanitizeInput(req.body.title || req.body.name || 'New Event');
        const description = sanitizeInput(req.body.description || '');
        const image = sanitizeInput(req.body.image || req.body.imageData || '');
        const eventDate = sanitizeInput(req.body.date || new Date().toISOString());
        const venueId = sanitizeInput(req.body.venueId || '');
        const id = `event_${Date.now()}`;

        const ev = { id, title, description, image, date: eventDate, venueId, attendees: [], createdAt: new Date().toISOString() };
        db.events = db.events || [];
        db.events.push(ev);
        saveData();

        // Notify web-push subscribers
        const payload = JSON.stringify({
            title: `New event: ${title}`,
            body: description || `Event on ${eventDate}`,
            url: `/events/${id}`
        });

        if (db.subscriptions && db.subscriptions.length && vapidPublicKey) {
            db.subscriptions = db.subscriptions || [];
            const toRemove = [];
            for (const sub of db.subscriptions) {
                webpush.sendNotification(sub, payload).catch(err => {
                    console.warn('WebPush send failed, removing subscription', err && err.statusCode, err && err.body);
                    toRemove.push(sub.endpoint);
                });
            }
            if (toRemove.length) {
                db.subscriptions = db.subscriptions.filter(s => !toRemove.includes(s.endpoint));
                saveData();
            }
        }

        // Optional SMS broadcast (only if Twilio configured) — notify recent leads
        try {
            if (twilioClient) {
                const message = `📣 ${title} — ${description || ''} Visit wett.vip for details.`;
                const recipients = leads.slice(-200).map(l => l.phone).filter(Boolean); // limit to recent 200 to avoid large sends
                for (const phone of recipients) {
                    sendSMS(phone, message).catch(() => {});
                }
            }
        } catch (e) {}

        res.json({ success: true, event: ev, notified: { webPush: db.subscriptions.length } });
    } catch (e) {
        console.error('Error creating event', e);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

// Admin: delete event
app.delete('/api/admin/events/:id', (req, res) => {
    try {
        const id = req.params.id;
        const idx = (db.events || []).findIndex(e => e.id === id);
        if (idx < 0) return res.status(404).json({ error: 'Not found' });
        db.events.splice(idx, 1);
        saveData();
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting event', e);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Public: RSVP / activate interest for an event
app.post('/api/events/:id/rsvp', async (req, res) => {
    try {
        const eventId = req.params.id;
        const name = sanitizeInput(req.body.name || '');
        const phone = sanitizeInput(req.body.phone || '');
        const leadId = sanitizeInput(req.body.leadId || '');

        const ev = (db.events || []).find(e => e.id === eventId || e.id === eventId);
        if (!ev) return res.status(404).json({ error: 'Event not found' });

        const attendee = {
            id: `att_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            name: name || null,
            phone: phone || null,
            leadId: leadId || null,
            activatedAt: new Date().toISOString()
        };

        ev.attendees = ev.attendees || [];
        ev.attendees.push(attendee);
        saveData();

        // Optional confirmation SMS
        if (phone && twilioClient) {
            try {
                await sendSMS(phone, `You're confirmed for: ${ev.title} — see you there!`);
            } catch (err) { console.error('Failed sending RSVP SMS', err); }
        }

        res.json({ success: true, attendee });
    } catch (e) {
        console.error('Error registering RSVP', e);
        res.status(500).json({ error: 'Failed to register RSVP' });
    }
});

// Public: list events (for clients)
app.get('/api/events', (req, res) => {
    try {
        const out = (db.events || []).map(e => ({
            id: e.id,
            title: e.title || e.name,
            description: e.description,
            image: e.image,
            date: e.date,
            venueId: e.venueId
        }));
        res.json(out);
    } catch (e) {
        console.error('Error listing events', e);
        res.status(500).json({ error: 'Failed to list events' });
    }
});

// Public: get single event
app.get('/api/events/:id', (req, res) => {
    try {
        const ev = (db.events || []).find(x => x.id === req.params.id);
        if (!ev) return res.status(404).json({ error: 'Not found' });
        res.json(ev);
    } catch (e) {
        console.error('Error getting event', e);
        res.status(500).json({ error: 'Failed to get event' });
    }
});

// --- BACKUPS & RESTORE ---
app.get('/api/admin/backups', (req, res) => {
    try {
        if (!fs.existsSync(BACKUPS_DIR)) return res.json([]);
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const s = fs.statSync(path.join(BACKUPS_DIR, f));
                return { name: f, size: s.size, mtime: s.mtime };
            })
            .sort((a, b) => b.mtime - a.mtime);
        res.json(files);
    } catch (e) {
        console.error('Error listing backups', e);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

app.post('/api/admin/restore', (req, res) => {
    try {
        const filename = req.body && req.body.filename;
        if (!filename) return res.status(400).json({ error: 'filename required' });
        const src = path.join(BACKUPS_DIR, path.basename(filename));
        if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup not found' });

        fs.copyFileSync(src, DATA_FILE);
        const ok = reloadData();

        // audit
        try {
            const auditLine = `${new Date().toISOString()} RESTORE ${req.session && req.session.adminUser ? req.session.adminUser : 'unknown'} ${filename}\n`;
            fs.appendFileSync(path.join(BACKUPS_DIR, 'audit.log'), auditLine);
        } catch (auditErr) {}

        if (!ok) return res.status(500).json({ error: 'Restore failed' });
        res.json({ success: true, restored: filename });
    } catch (e) {
        console.error('Error restoring backup', e);
        res.status(500).json({ error: 'Restore failed' });
    }
});

// Bulk import models (safe add only)
app.post('/api/admin/import-models', (req, res) => {
    try {
        const incoming = req.body && req.body.models;
        if (!Array.isArray(incoming)) return res.status(400).json({ error: 'models array required' });
        let added = 0;
        for (const m of incoming) {
            const name = sanitizeInput(m.name || m.displayName || '');
            if (!name) continue;
            const exists = models.find(x => x.name === name || x.id === m.id);
            if (exists) continue;
            const model = {
                id: m.id || `model_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                name,
                description: sanitizeInput(m.description || ''),
                location: sanitizeInput(m.location || ''),
                totalTaps: Number(m.totalTaps) || 0,
                conversions: Number(m.conversions) || 0
            };
            models.push(model);
            added++;
        }
        if (added) saveData();
        res.json({ success: true, added });
    } catch (e) {
        console.error('Error importing models', e);
        res.status(500).json({ error: 'Import failed' });
    }
});

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
 * Send a generic SMS (uses Twilio when configured, otherwise logs).
 */
async function sendSMS(phone, message) {
    if (!phone) return null;
    if (!twilioClient) {
        console.log(`📱 SMS skipped (Twilio not configured). Would send to ${phone}: ${message}`);
        return null;
    }
    try {
        const msg = await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        console.log(`📱 SMS sent to ${phone}:`, msg.sid);
        return msg;
    } catch (err) {
        console.error('Error sending SMS', err);
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
