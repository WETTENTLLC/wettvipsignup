# WETT VIP Portal - Complete Setup & Deployment Guide

## Quick Start (5 minutes)

### Frontend Only (Static Hosting)
1. Upload these files to your host:
   - `index.html`
   - `styles.css`
   - `script.js`

2. Visit `https://wett.vip/tag/MODEL_ID_123`

3. Done! (QR codes work out-of-the-box via free API)

---

## Full Setup with Backend (Recommended)

### Prerequisites
- **Node.js** 14+ installed
- **Twilio Account** (for SMS) - [Sign up here](https://www.twilio.com/console)
- **Git** (for version control)
- **Docker** (optional, for containerized deployment)

### Step 1: Get Twilio Setup

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Copy your:
   - Account SID
   - Auth Token
   - Get a Twilio phone number (e.g., +1234567890)
3. Save these for later

### Step 2: Local Development Setup

```bash
# Clone or download the project
cd wett-vip-portal

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your values
# TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_AUTH_TOKEN=your_token_here
# TWILIO_PHONE_NUMBER=+1234567890
```

### Step 3: Run Locally

```bash
# Start backend server
npm run dev

# Visit in browser
http://localhost:5000

# Test with ModelID
http://localhost:5000/tag/test-model-123
```

---

## Deployment Options

### Option A: Vercel (Fastest for Frontend)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# You'll get a URL like: wett.vip or your-custom-domain.com
```

**Pros**: Free tier, instant updates, built-in SSL
**Cons**: Frontend only (needs separate backend)

### Option B: Render (Frontend + Backend)

1. Push code to GitHub
2. Go to [Render.com](https://render.com)
3. Connect GitHub repo
4. Create Web Service
5. Set environment variables from `.env`
6. Deploy!

**Pros**: Free tier, full stack, easy setup
**Cons**: Slower cold starts

### Option C: AWS (Production Grade)

#### Frontend
```bash
# S3 + CloudFront
aws s3 cp index.html s3://wett-vip-portal/
aws s3 cp styles.css s3://wett-vip-portal/
aws s3 cp script.js s3://wett-vip-portal/
```

#### Backend
```bash
# Elastic Beanstalk
eb init
eb create wett-vip-backend
eb deploy
```

**Pros**: Scalable, reliable, enterprise-grade
**Cons**: Steeper learning curve, can get expensive

### Option D: Docker Containerization

#### Backend Dockerfile
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY backend-example.js .
EXPOSE 5000
CMD ["node", "backend-example.js"]
```

#### Frontend Dockerfile
```dockerfile
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Run with Docker Compose
```bash
docker-compose up -d
```

---

## Database Setup (Optional but Recommended)

### PostgreSQL (For production)

```sql
-- Create leads table
CREATE TABLE leads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    model_id VARCHAR(50),
    timestamp TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create passes table
CREATE TABLE passes (
    id SERIAL PRIMARY KEY,
    pass_code VARCHAR(8) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    venue_id VARCHAR(50),
    model_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    used BOOLEAN DEFAULT FALSE,
    redeemed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indices for faster queries
CREATE INDEX idx_passes_phone ON passes(phone);
CREATE INDEX idx_passes_venue ON passes(venue_id);
CREATE INDEX idx_leads_model ON leads(model_id);
```

### Connect to Backend

Update `backend-example.js`:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

// Use pool.query() instead of in-memory arrays
```

---

## Domain Setup

### 1. Register domain (if not done)
- GoDaddy, Namecheap, etc.
- Register: `wett.vip` or similar

### 2. Point to your host

**For Vercel:**
```
CNAME: cname.vercel.com
```

**For Render:**
```
CNAME: onrender.com
```

**For AWS CloudFront:**
```
CNAME: d1234567890.cloudfront.net
```

### 3. SSL Certificate
- Automatic for most services
- Or use Let's Encrypt for free

---

## Real-Time Updates Flow

```
1. Update venues in script.js ✏️
   ↓
2. Commit to git
   ↓
3. Deploy (Vercel auto-deploys)
   ↓
4. All NFC tags instantly point to new data ⚡
   ↓
5. Customers see updated offers in seconds
```

No need to update physical tags!

---

## A/B Testing Setup

### Track by ModelID (Built-in)

```
Group A: wett.vip/tag/model-premium-placement
Group B: wett.vip/tag/model-budget-placement

Admin Dashboard shows:
- Group A: 150 visitors, 45% conversion (68 passes)
- Group B: 80 visitors, 30% conversion (24 passes)

Result: Premium placement worth 5x ROI
```

---

## Retention SMS (Automated)

### Set up cron job (runs daily)

```bash
# On your server, add to crontab
0 10 * * * node send-retention-sms.js

# Or use GitHub Actions:
```

Create `.github/workflows/retention.yml`:

```yaml
name: Send Retention SMS
on:
  schedule:
    - cron: '0 10 * * *'  # 10 AM daily

jobs:
  send-sms:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: node send-retention-sms.js
        env:
          TWILIO_ACCOUNT_SID: ${{ secrets.TWILIO_ACCOUNT_SID }}
          TWILIO_AUTH_TOKEN: ${{ secrets.TWILIO_AUTH_TOKEN }}
```

---

## Monitoring & Analytics

### Enable Google Analytics

Add to `index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_ID');
</script>
```

Then in `script.js`, uncomment:
```javascript
if (window.gtag) {
    window.gtag('event', event, analyticsData);
}
```

### Dashboard Queries

```bash
# Total leads by model
curl http://localhost:5000/api/admin/leads/model-premium-placement

# Overall stats
curl http://localhost:5000/api/admin/stats
```

---

## Troubleshooting

### Issue: SMS not sending
**Solution:**
1. Check Twilio balance (need $0.01+ per SMS)
2. Verify phone number format: `+1234567890`
3. Verify TWILIO_PHONE_NUMBER in `.env`

### Issue: QR codes not working
**Solution:**
1. QR codes use free API (qrserver.com)
2. Offline? Use `qrcode` npm package instead

### Issue: Deployment fails
**Solution:**
```bash
# Check logs
npm run dev

# Test backend locally
curl -X POST http://localhost:5000/api/leads \
  -H "Content-Type: application/json" \
  -d '{"name":"John","phone":"+1234567890","modelId":"test"}'
```

---

## Security Checklist

- [ ] Use HTTPS only (automatic on Vercel/Render)
- [ ] Validate phone numbers before sending SMS
- [ ] Rate limit SMS to prevent abuse
- [ ] Never commit `.env` file
- [ ] Use environment variables for secrets
- [ ] Add CORS restrictions
- [ ] Sanitize user input
- [ ] Add authentication for admin endpoints

---

## Scaling Considerations

**When to upgrade:**
- 100+ requests/day: Add database
- 1000+ requests/day: Add caching (Redis)
- 10k+ requests/day: Add CDN
- 100k+ requests/day: Multi-region deployment

---

## Support & Next Steps

1. ✅ Deploy frontend
2. ✅ Set up Twilio
3. ✅ Deploy backend
4. ✅ Test end-to-end flow
5. ✅ Set up analytics
6. ✅ Configure retention SMS
7. ✅ Print QR codes on physical tags
8. 🚀 Launch!

Questions? Check the main README.md or reach out to your development team.
