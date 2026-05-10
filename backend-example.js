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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Twilio setup (for SMS) - only init if credentials exist
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// In-memory database (replace with real DB in production)
const leads = [];
const passes = [];
const venues = [];
const models = [];

// SPA route handling - serve index.html for /tag/:modelId
app.get('/tag/:modelId', (req, res) => {
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
        const { name, phone, modelId, timestamp } = req.body;

        // Validate input
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
        const { phone, venueId, modelId } = req.body;

        // Validate input
        if (!phone || !venueId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate unique pass code
        const passCode = generatePassCode();

        // Generate QR code
        const qrCodeData = await generateQRCode(passCode, venueId);

        // Send SMS with pass
        await sendPassViaSMS(phone, passCode, venueId);

        // Create pass record
        const pass = {
            id: `pass_${Date.now()}`,
            passCode,
            phone,
            venueId,
            modelId,
            timestamp: new Date().toISOString(),
            status: 'active',
            used: false
        };

        // Save to database
        passes.push(pass);

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
        const { passCode, venueId } = req.body;

        // Find pass
        const pass = passes.find(p => 
            p.passCode === passCode && 
            p.status === 'active'
        );

        if (!pass) {
            return res.status(404).json({ 
                valid: false, 
                message: 'Invalid or expired pass' 
            });
        }

        if (pass.used) {
            return res.status(400).json({ 
                valid: false, 
                message: 'Pass already redeemed',
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
        const { passCode, venueId, confirmedAt } = req.body;

        // Find pass
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
                error: 'Pass already redeemed',
                redeemedAt: pass.redeemedAt
            });
        }

        // Mark as used
        pass.used = true;
        pass.redeemedAt = confirmedAt || new Date().toISOString();

        console.log('🎉 Entry confirmed and pass redeemed:', pass);

        res.json({
            success: true,
            passCode,
            venueId: pass.venueId,
            customerName: pass.phone,
            redeemedAt: pass.redeemedAt,
            message: 'Customer checked in successfully!'
        });

    } catch (error) {
        console.error('Error confirming entry:', error);
        res.status(500).json({ error: 'Failed to confirm entry' });
    }
});

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
    const { name, address, offer, icon, fee } = req.body;
    if (!name || !offer || fee == null) return res.status(400).json({ error: 'Missing fields' });
    const venue = { id: name.toLowerCase().replace(/\s+/g, '-'), name, address, offer, icon: icon || '🎭', fee };
    const existing = venues.findIndex(v => v.id === venue.id);
    if (existing >= 0) venues[existing] = venue; else venues.push(venue);
    res.json(venue);
});

app.delete('/api/admin/venues/:id', (req, res) => {
    const idx = venues.findIndex(v => v.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    venues.splice(idx, 1);
    res.json({ success: true });
});

// --- MODELS CRUD ---
app.get('/api/admin/models', (req, res) => res.json(models));

app.post('/api/admin/models', (req, res) => {
    const { name, description, location } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const model = { id: `model_${Date.now()}`, name, description, location, totalTaps: 0, conversions: 0 };
    models.push(model);
    res.json(model);
});

app.delete('/api/admin/models/:id', (req, res) => {
    const idx = models.findIndex(m => m.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    models.splice(idx, 1);
    res.json({ success: true });
});

// --- PASSES LIST ---
app.get('/api/admin/passes', (req, res) => res.json(passes));

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
    if (!twilioClient) {
        console.log(`📱 SMS skipped (Twilio not configured). Would send to ${phone}: Pass ${passCode}`);
        return null;
    }
    try {
        const venueName = getVenueName(venueId);
        const message = await twilioClient.messages.create({
            body: `🎉 Your ${venueName} VIP Pass: ${passCode}\n\nShow this code at the door for your exclusive offer!`,
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
 * Get venue name (hardcoded for example)
 */
function getVenueName(venueId) {
    const venues = {
        'wolf-den': 'Wolf Den Bar & Grill',
        'strip-club': 'Establishment B (Strip Club)',
        'lounge': 'Establishment C (Lounge)'
    };
    return venues[venueId] || 'Venue';
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

module.exports = app;
