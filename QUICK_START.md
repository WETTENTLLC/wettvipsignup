# WETT VIP Portal - Quick Start (5 Minutes)

## TL;DR - Launch Today

### Fastest Option: Frontend Only (Vercel)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy these 3 files
vercel --name wett-vip-portal

# 3. Get your URL (e.g., wett-vip-portal.vercel.app)

# 4. Visit:
# https://wett-vip-portal.vercel.app/tag/test-model-123
```

**Time: 5 minutes. Cost: Free. QR codes work out-of-the-box.**

---

## Full Setup: With SMS (15 Minutes)

### Step 1: Get Twilio (2 minutes)
```
1. Go to twilio.com
2. Sign up (free account)
3. Get a phone number (e.g., +1234567890)
4. Copy: Account SID and Auth Token
5. Save to notepad
```

### Step 2: Deploy Backend (5 minutes)
```bash
# Option A: Render.com (Easiest)
1. Go to render.com
2. Connect GitHub (or upload files directly)
3. Create new "Web Service"
4. Add environment variables from .env.example
5. Deploy

# Option B: Heroku (Legacy but works)
npm install -g heroku
heroku create wett-vip-backend
git push heroku main
```

### Step 3: Update Frontend (2 minutes)
In `script.js`, uncomment line ~120:
```javascript
await sendLeadToBackend(formData);
```

### Step 4: Test (2 minutes)
1. Fill out the form with your phone number
2. Select a venue
3. Check your phone for SMS ✅

---

## Files You Have

```
✅ index.html       → Frontend (ready to deploy)
✅ styles.css       → Beautiful styling
✅ script.js        → All the logic
✅ backend-example.js → API server
✅ README.md        → Full docs
✅ DEPLOYMENT_GUIDE.md → How to deploy
✅ BUSINESS_LOGIC.md   → Make money with this
```

---

## What Happens When Someone Taps the Tag

```
1. NFC tap at venue
   ↓
2. Phone opens: wett.vip/tag/MODEL_ID_123
   ↓
3. Landing page loads (instant)
   ↓
4. Customer enters Name + Phone
   ↓
5. They see venue list
   ↓
6. They tap a venue
   ↓
7. QR code appears on screen
   ↓
8. They get SMS: "Show this QR at the door"
   ↓
9. They show staff the QR code
   ↓
10. Staff scans it (free scanner on phone)
   ↓
11. Staff lets them in with their offer 🎉
```

---

## Customization in 30 Seconds

### Change Venues
In `script.js`, edit the `VENUES` array:
```javascript
const VENUES = [
    {
        id: 'my-venue',
        name: 'Your Venue Name',
        offer: 'Your offer text',
        icon: '🍺'  // Choose emoji
    }
];
```

### Change Colors
In `styles.css`, edit colors:
```css
--primary-color: #d4af37;      /* Gold */
--accent-color: #ff1493;       /* Pink */
--secondary-color: #1a1a1a;    /* Black */
```

### Change Text
In `index.html`, search and replace:
- "WETT VIP" → Your brand name
- "Unlock Your Secret Map" → Your tagline

---

## Real-Time Updates

**The Best Part:** 

Change anything on the website → ALL customers see it instantly on next tap

No printing. No waste. No outdated tags.

---

## A/B Testing Setup

Create different model IDs for different placements:

```
📍 Bar entrance (premium spot):
   wett.vip/tag/model-bar-entrance

📍 Restroom sign (secondary):
   wett.vip/tag/model-restroom

📍 Window poster (third):
   wett.vip/tag/model-window

Then check admin dashboard to see which placement gets the most taps!
```

---

## Next Steps

### This Week
1. ✅ Deploy frontend (5 min)
2. ✅ Test locally (5 min)
3. ✅ Share with stakeholders (5 min)

### Next Week
1. Get Twilio account (5 min)
2. Deploy backend (15 min)
3. Test SMS (5 min)
4. Print NFC tags (outsource to vendor)

### Following Week
1. Place tags at venues
2. Monitor analytics
3. Collect feedback
4. Optimize offers

---

## Quick Troubleshooting

**"It's not working"**
→ Open browser console (F12) and look for errors

**"SMS not sending"**
→ Check that TWILIO_PHONE_NUMBER is correct in .env

**"QR code won't scan"**
→ Make sure there's good lighting. QR codes work fine!

**"Can I run this locally?"**
```bash
python -m http.server 8000
# Visit http://localhost:8000/tag/test
```

---

## Deployment URLs

### Frontend Hosting Options
- **Vercel**: vercel.com (fastest, $0)
- **Netlify**: netlify.com ($0)
- **GitHub Pages**: pages.github.com ($0)
- **AWS S3 + CloudFront**: AWS ($few dollars)

### Backend Hosting Options
- **Render**: render.com ($0 for starter)
- **Railway**: railway.app ($5/month)
- **Heroku**: heroku.com (paid now)
- **AWS Lambda**: AWS (pay-per-use)

---

## Business Model

```
Per Customer:
- Capture phone + name
- Send pass for venue A
- Venue A pays: $1-3

Cross-Promotion:
- Customer visits venue B next day
- Send SMS: "Try Venue C"
- Venue C pays: $1-2

Loyalty Tier:
- After 5 visits: "VIP Elite" status
- Higher venue fees for reliable customers

Sponsors:
- Alcohol brands pay to add discount codes
- Dating apps pay to target nightlife crowd
```

**Expected:** $400-1000/month with 3-5 venues

---

## One More Thing

The magic is in the data. After 1 month, you'll know:

- Which venues are most popular
- Which placements drive the most traffic
- Customer preferences
- Best times to promote

Use this to negotiate better fees and build a national franchise.

---

## You're All Set 🚀

Deployed? Awesome!

**Next:** Read BUSINESS_LOGIC.md to start making money.

Questions? Check README.md for full documentation.

Happy launching! 🎉
