# WETT VIP Portal - Landing Page

A modern, mobile-first landing page for the WETT VIP Portal that implements the complete customer flow: NFC tag tap → data capture → venue selection → QR code generation → SMS delivery.

## Project Structure

```
├── index.html       # Main HTML structure
├── styles.css       # Styling and responsive design
├── script.js        # Frontend logic and interactivity
└── README.md        # This file
```

## Features

✅ **Three-Step Flow**
1. **Data Capture**: Collects customer name and phone number
2. **Venue Portal**: Displays list of active venues with exclusive offers
3. **Pass Generation**: Creates QR code and confirms SMS delivery

✅ **Mobile-First Design**
- Responsive layout optimized for phones
- Touch-friendly buttons and inputs
- Fast loading and smooth animations

✅ **Real-Time Model Tracking**
- Extracts `ModelID` from URL (`wett.vip/tag/[ModelID]`)
- Tracks which NFC tag source each customer came from
- Tags leads for A/B testing and analytics

✅ **Built-in Analytics**
- Logs all customer actions (form submission, venue selection, etc.)
- Tracks conversion funnel
- Ready for Google Analytics or Mixpanel integration

✅ **QR Code Generation**
- Uses free QR Server API (no backend dependencies)
- Generates unique pass codes
- Embeds venue and pass data

## URL Structure

```
https://wett.vip/tag/MODEL_ID_123
https://wett.vip/tag/MODEL_ID_456
```

The `MODEL_ID` is automatically extracted and logged for tracking which physical NFC tags drive the most traffic.

## Customization

### Adding/Editing Venues

Edit the `VENUES` array in `script.js`:

```javascript
const VENUES = [
    {
        id: 'wolf-den',
        name: 'Wolf Den Bar & Grill',
        offer: 'Claim Free Drink Pass',
        icon: '🍺'
    },
    // Add more venues here
];
```

### Branding

Customize colors in `styles.css`:

```css
:root {
    --primary-color: #d4af37;      /* Gold */
    --secondary-color: #1a1a1a;    /* Black */
    --accent-color: #ff1493;       /* Hot Pink */
    /* ... more colors ... */
}
```

### Connecting to Your Backend

The frontend is ready to integrate with backend APIs:

#### 1. **Lead Capture Endpoint** (Optional)
```javascript
// POST /api/leads
{
    "name": "John Doe",
    "phone": "(555) 123-4567",
    "modelId": "MODEL_ID_123",
    "timestamp": "2026-05-09T10:30:00Z"
}
```

#### 2. **Pass Generation Endpoint** (Recommended)
```javascript
// POST /api/passes
// Request:
{
    "phone": "(555) 123-4567",
    "venueId": "wolf-den",
    "modelId": "MODEL_ID_123"
}

// Response:
{
    "passCode": "ABC12345",
    "qrCodeUrl": "data:image/png;base64,...",
    "smsStatus": "sent"
}
```

#### 3. **Analytics Endpoint** (Optional)
```javascript
// POST /api/analytics
{
    "event": "venue_selected",
    "modelId": "MODEL_ID_123",
    "venueId": "wolf-den",
    "timestamp": "2026-05-09T10:32:00Z"
}
```

### Enabling Backend Integration

Uncomment the backend calls in `script.js`:

1. **Lead Submission** - Line ~120:
```javascript
await sendLeadToBackend(formData);
```

2. **Pass Generation** - Line ~180:
```javascript
// In processPassGeneration(), call your backend:
const response = await fetch('/api/passes', {
    method: 'POST',
    body: JSON.stringify({
        phone: formData.phone,
        venueId: venue.id,
        modelId: formData.modelId
    })
});
```

3. **Analytics** - Uncomment line ~240:
```javascript
// fetch('/api/analytics', { method: 'POST', body: JSON.stringify(analyticsData) });
```

## How to Deploy

### Option 1: Static Hosting (Fastest)
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront

Simply push these 3 files and they're live.

### Option 2: With Backend (Recommended)
1. Set up backend server (Node.js, Python, etc.)
2. Implement the three API endpoints above
3. Deploy frontend + backend together

### Option 3: Containerized
```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Testing Locally

1. Open `index.html` in a browser
2. Or use a local server:
```bash
python -m http.server 8000
# Visit http://localhost:8000
```

3. To test with a ModelID:
```
http://localhost:8000/tag/test-model-123
```

## Data Flow

```
1. Customer taps NFC tag at venue
   ↓
2. Phone redirects to wett.vip/tag/[ModelID]
   ↓
3. Landing page loads with form
   ↓
4. Customer enters Name + Phone
   ↓
5. Backend records lead + ModelID (for tracking)
   ↓
6. Venue list appears
   ↓
7. Customer selects venue
   ↓
8. Backend generates pass + QR code + sends SMS
   ↓
9. Customer sees pass confirmation
   ↓
10. Customer shows QR at door
```

## Key Business Insights

The system automatically captures:
- **Which venues are most popular** (by selection count)
- **Which NFC tags drive the most traffic** (by ModelID)
- **Customer demographics** (names, phone numbers)
- **Conversion funnel** (form completion → venue selection rate)
- **Peak traffic times** (analytics timestamps)

Use this data to:
- **A/B Test**: Compare performance of different NFC tag placements
- **Negotiate**: "80% of customers chose Wolf Den, we demand higher fees"
- **Cross-promote**: "Customers who visited Club A are likely to visit Club B"
- **Retention**: Automated SMS sequences based on venue visits

## SMS Integration

This system is designed to work with:
- **Twilio** (recommended)
- **AWS SNS**
- **Custom SMS API**

Example Twilio integration:
```python
from twilio.rest import Client

client = Client(account_sid, auth_token)
client.messages.create(
    to=customer_phone,
    from_="+1234567890",
    body=f"Your {venue_name} VIP Pass: {pass_code}. Show this at the door!"
)
```

## Support

For questions or customization needs, refer to:
- Frontend logic: `script.js`
- Styling: `styles.css`
- HTML structure: `index.html`

## Version History

- v1.0 - Initial release with 3-step flow

## Admin setup (login + environment)

1. Generate a bcrypt hash for your chosen admin password (run locally):

```bash
# Linux / macOS / WSL
node scripts/generate-hash.js 'YourPlainPassword'

# Windows (PowerShell)
node scripts/generate-hash.js "YourPlainPassword"
```

Copy the resulting hash and set it in your environment as `ADMIN_PASSWORD_HASH`. Also set a strong `SESSION_SECRET`.

PowerShell (current session):

```powershell
$env:ADMIN_PASSWORD_HASH = '<paste-hash-here>'
$env:SESSION_SECRET = 'a-long-random-secret'
```

Persist on Windows (permanent):

```powershell
setx ADMIN_PASSWORD_HASH "<paste-hash-here>"
setx SESSION_SECRET "<your-secret>"
```

Or create a local `.env` file (do NOT commit it):

```
ADMIN_USER=admin
ADMIN_PASSWORD_HASH=<paste-hash-here>
SESSION_SECRET=<your-secret>
```

Start the server:

```bash
npm start
```

Security notes:
- Never commit `.env` or real secrets to source control.
- Use a production session store (Redis) and rotate `SESSION_SECRET` regularly.
- Consider using an external identity provider (OAuth) for multi-admin environments.
