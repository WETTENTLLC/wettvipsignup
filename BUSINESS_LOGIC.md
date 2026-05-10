# WETT VIP Portal - Business Logic & Strategy Guide

## The Three Revenue Streams

### 1. **Venue Entry Fees** (Immediate)
Each venue pays WETT a "Retention Fee" every time a customer uses their pass:
- Wolf Den: $2/pass × 150 passes/month = $300
- Strip Club: $1.50/pass × 80 passes/month = $120
- Lounge: $1/pass × 40 passes/month = $40
- **Monthly Revenue: ~$460 per 3 venues**

### 2. **A/B Testing Intelligence** (Negotiation Power)
Use analytics to demand higher fees from popular venues:

```
Scenario:
- Wolf Den: 60% of all claims (90 out of 150 customers)
- Strip Club: 30% of claims (45 out of 150)
- Lounge: 10% of claims (15 out of 150)

Negotiation:
"Wolf Den, you're 2x more popular than competitors. 
That's worth $3/pass, not $2."

Result: +$150/month just from data leverage
```

### 3. **Cross-Venue Marketing** (Long-term Loyalty)
Track customers across multiple venues and cross-promote:

```
Customer visited:
- Wolf Den on Thursday
- Lounge on Saturday

Send SMS:
"Since you loved Wolf Den's vibe, strip club B 
has a similar crowd. Show this for VIP entry: [CODE]"

Result: 
- Lounge sees 20% more customers
- Willing to pay premium for traffic source
```

---

## Data You're Collecting

### Per Customer
- ✅ Name
- ✅ Phone number
- ✅ First venue visited
- ✅ Visit timestamp
- ✅ Source NFC tag model ID

### Per Visit Pattern
- How often they visit venues
- Which venues they prefer
- Peak traffic times
- Cross-venue behavior

### Per Venue
- Total claims (popularity metric)
- Conversion rate (% who actually visit)
- Peak days/times
- Customer retention

---

## The Retention SMS Strategy

### Day 1 (Immediate)
```
SMS: "🎉 Your [Venue] pass is here! 
Show [CODE] at the door for your VIP offer."
```
**Goal**: Get them to use the pass ASAP

### Day 3
```
SMS: "💝 You still have an unused pass for [Venue B]. 
Use it this weekend for [OFFER]"
```
**Goal**: Convert those who haven't redeemed yet

### Day 7
```
SMS: "🏆 You're 1 visit away from WETT Elite 
status at [Venue A]. Visit tonight for bonus rewards!"
```
**Goal**: Create urgency around "regular" status

### Day 14
```
SMS: "🎊 New venues added! Tap here for 
exclusive offers at 3 new spots: [LINK]"
```
**Goal**: Re-engage and keep app usage high

### Day 30
```
SMS: "🚀 WETT VIP Elite Member! 
50% off entry fees this month. VIP treatment guaranteed."
```
**Goal**: Premium tier membership (future revenue stream)

---

## Multi-Venue Tracking Logic

### Customer Journey Example

```
Timeline:
---

Thursday 10 PM - Wolf Den
├─ Tap NFC tag → Capture phone
├─ Select Wolf Den pass
├─ Receive: WETT001 (pass code)
└─ Database: wolf_den_visit_1

Friday 8 PM - Strip Club
├─ Tap NFC tag → Already captured (phone match)
├─ Select Strip Club pass
├─ Receive: WETT002
└─ Database: strip_club_visit_1

Saturday 2 AM - Back to Wolf Den
├─ Tap NFC tag → Phone match, repeat customer!
├─ Select Wolf Den pass
├─ Receive: WETT003
└─ Database: wolf_den_visit_2 ⭐ (trigger email: "Becoming regular...")

---

Status: 2 visits to Wolf Den = "Regular" status
Next Goal: 5 visits = "VIP Elite"
```

### Automations Based on Status

**Regular Status** (2+ visits at one venue):
```javascript
if (customerVisits[venue] >= 2) {
    sendSMS("You're becoming a regular here! 
             Exclusive perks unlocked.");
    
    // Increase venue's willingness to pay retention fee
    venueRetentionFee += 0.50; // $2 → $2.50
}
```

**VIP Elite Status** (5+ visits at one venue):
```javascript
if (customerVisits[venue] >= 5) {
    // Biggest revenue opportunity
    sendSMS("VIP Elite! You get lifetime 
             50% discounts at [Venue]");
    
    // Charge venue premium for elite customers
    venueRetentionFee += 1.00; // $2.50 → $3.50
}
```

---

## Real-Time Updates = Competitive Advantage

### Traditional Model (Physical Cards)
```
Monday: Print 1000 promo cards
Tuesday: Realize venue B is outdated
Wednesday: All old cards still in the field ❌
```

### WETT VIP Model (Digital)
```
Monday: Add Venue A to website
Tuesday: Realize Venue A underperforming
Wednesday: Remove it, add Venue C
Thursday: ALL customers see Venue C next tap ✅

No printing. No waste. No outdated material.
```

---

## Negotiation Scripts (For Sales)

### For Venues
```
"You're #1 in the city right now. 
Here's the data: 60% of our customers choose you over competitors.

That's worth $3/pass to maintain this traffic stream.
Plus, you get weekly analytics showing:
- How many customers came from us
- Their repeat visit rate
- Cross-venue patterns (who leaves you to visit competitors)

With this intel, you can improve offers."
```

### For Advertisers/Sponsors
```
"We have verified phone numbers and visit patterns 
for 1000+ customers. 

We can target:
- 'People who visited Wolf Den' 
- 'Multi-venue visitors' 
- 'Friday/Saturday crowd'

SMS cost per customer: $0.01
Conversion rate: 15-20% for relevant offers

Want to run a campaign?"
```

---

## Analytics Dashboard Queries

### Get popularity ranking
```sql
SELECT venue_id, COUNT(*) as total_claims, 
       COUNT(CASE WHEN used=true THEN 1 END) as redeemed_rate
FROM passes
GROUP BY venue_id
ORDER BY total_claims DESC;
```

Result:
```
wolf_den      | 150 | 92% redeemed ⭐ Popular AND reliable
strip_club    | 80  | 65% redeemed   ⚠️ Popular but low usage
lounge        | 40  | 55% redeemed   ⚠️ Niche audience
```

### Get repeat customer rate
```sql
SELECT 
    phone, 
    COUNT(DISTINCT venue_id) as venues_visited,
    COUNT(*) as total_passes
FROM passes
GROUP BY phone
HAVING COUNT(*) >= 2
ORDER BY total_passes DESC;
```

Result: Find your best multi-venue customers for VIP program

### Get A/B testing results
```sql
SELECT model_id, COUNT(*) as leads, 
       COUNT(CASE WHEN venue_id IS NOT NULL THEN 1 END) as conversions,
       ROUND(100.0 * COUNT(CASE WHEN venue_id IS NOT NULL THEN 1 END) / 
       COUNT(*), 2) as conversion_rate
FROM leads
GROUP BY model_id
ORDER BY conversion_rate DESC;
```

Result:
```
model-premium-placement  | 150 | 75 | 50% ✅ Best performer
model-budget-placement   | 100 | 20 | 20% ⚠️ Poor performer
```

---

## Pricing Strategy

### Current Model
```
Per Pass Redemption:
- Wolf Den (high demand): $2.50
- Strip Club (medium): $1.50  
- Lounge (niche): $1.00

Volume: 270 passes/month = ~$400/month
```

### Growth Model (Months 3-6)
```
- Add 3 new venues
- Implement Elite status tier
- Launch SMS upsells
- Target: 500 passes/month = ~$900/month
```

### Scale Model (Months 6-12)
```
- Expand to 15+ venues
- Premium "Concierge" tier (white-glove service)
- Corporate partnerships (bottle service discount codes)
- Sponsorship ad slots in app
- Target: 2000 passes/month = $5000+/month
```

---

## Red Flags & Risks

⚠️ **If conversion drops below 30%**: 
→ Offers aren't attractive or venue has bad reputation

⚠️ **If same venue gets 80%+ of claims**: 
→ Others are losing appeal (quality issue? competitor?)

⚠️ **If redemption rate drops below 50%**: 
→ Pass codes leaked/shared (security issue)

⚠️ **High opt-outs after form**: 
→ Privacy concerns or form too long

---

## Competitive Moat

Why this is defensible:

1. **Data Lock-in**: Once you have 1000 customer phone numbers, switching costs = huge
2. **Network Effects**: More venues = more valuable to customers
3. **Real-time Updates**: Competitors stuck with static inventory
4. **SMS Channel**: Direct to customer (vs social media algorithms)
5. **First-mover Advantage**: In nightlife/bar scene, this is brand new

---

## Future Revenue Streams

### Phase 2 (Year 2)
- Premium "VIP Elite" membership tier ($5/month)
- Sponsored offers (alcohol brands, car services)
- Event promotion (insert live events into pass flow)

### Phase 3 (Year 3)
- International expansion (other cities)
- Point of sale integration (venues track redemptions in system)
- White-label solution for other cities/industries

---

## Success Metrics to Track

**Daily:**
- Leads captured
- Conversion rate (form → venue selection)
- Passes generated
- Venue popularity breakdown

**Weekly:**
- Retention SMS effectiveness (open rate, redemption)
- A/B test performance by model ID
- SMS opt-out rate

**Monthly:**
- Revenue per venue
- Repeat customer rate (% of customers with 2+ passes)
- Customer lifetime value
- Churn rate

---

## Next Steps

1. ✅ Deploy landing page
2. ✅ Set up Twilio account
3. ✅ Add first 5 venues
4. ✅ Print NFC tags with wett.vip/tag/[ModelID]
5. ✅ Place tags at target locations
6. ✅ Monitor analytics daily
7. ✅ A/B test placements
8. ✅ Onboard more venues based on data
9. ✅ Launch retention SMS sequences
10. 🚀 Scale to national model

Let the data lead the way. 📊
