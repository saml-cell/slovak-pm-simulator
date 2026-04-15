# Slovak PM Simulator — Business Plan

**Author:** Samuel K. | **Date:** April 2026 | **Version:** 1.0

---

## 1. Product Summary

A browser-based political simulator where players govern Slovakia across 9 real historical eras (1994–present). Built with TypeScript/Vite, ~73KB, zero dependencies. Features Nash bargaining, Monte Carlo elections (D'Hondt), economic modeling (Okun's Law, FDI, brain drain), 108 politician personas, 1,600+ real quotes, and optional AI-powered policy analysis.

**Live at:** saml-cell.github.io/slovak-pm-simulator

---

## 2. The Honest Market Assessment

Slovakia has 5.4M people. The overlap of "interested in politics" + "plays browser games" + "discovers this site" is small — realistically hundreds to low thousands of active players, not tens of thousands. This plan is built around that reality, not fantasy growth projections.

**Target segments:**
- Slovak political junkies (18–35, social media active)
- Civics/political science students & teachers
- Slovak diaspora (nostalgia + language connection)
- Czech speakers (can read Slovak, similar political landscape)

---

## 3. Revenue Strategy (3 Tiers)

### Tier 1: Portfolio & Career Leverage (Highest ROI)

This is the most realistic path to significant money. The game demonstrates:
- Game theory implementation (Nash bargaining, Shapley power index)
- Economic modeling (Okun's Law, business cycles, Monte Carlo simulation)
- Full-stack development (TypeScript, Vite, zero-dep architecture)
- Domain expertise in political science and Slovak history
- Product thinking (analytics, shareable results, bug reporting)

**Actions:**
- Feature prominently on CV/LinkedIn/portfolio site
- Write a technical blog post: "How I Modeled Slovak Politics with Game Theory" — targets HN/dev Twitter
- Use as talking point in internship interviews (BBA + technical skills = rare combo)
- Pitch to political science professors as a collaboration opportunity

**Expected value:** A single internship or freelance contract secured partly through this portfolio piece is worth more than years of micro-donations. Target: 1 paid opportunity within 6 months.

### Tier 2: Low-Friction Direct Revenue

These require minimal infrastructure and match the current GitHub Pages hosting setup.

#### A. Donation Button (Ko-fi / Buy Me a Coffee)
- Add a "Support the developer" button on the hub page and game-over screen
- Cost: Free to set up, Ko-fi takes 0% on donations
- Realistic expectation: 5–20 EUR/month if the game gets shared on Slovak Reddit/Twitter
- Implementation: 1 hour — add a link + small icon

#### B. Premium AI Analysis Tier
The game already supports Groq (free) and Anthropic (paid) AI analysis. Currently players bring their own API key. Instead:
- Offer a **"Pro Analysis" mode** — prepaid credits (e.g., 50 AI analyses for 2 EUR)
- Use a lightweight serverless function (Cloudflare Workers, free tier) to proxy the API call with your key
- Player pays via Ko-fi "shop" items or Stripe payment link (no backend needed)
- Margin: Anthropic API costs ~$0.001/analysis. 50 analyses cost you ~$0.05. Sell for 2 EUR. That's 97% margin.
- Realistic expectation: 10–30 EUR/month from power users

#### C. Leaderboard "Supporter" Badge
- Players who donate get a gold badge next to their leaderboard name
- Social proof incentivizes others; costs nothing to implement
- Stored in localStorage flag set by a redemption code from Ko-fi

**Tier 2 total realistic range: 15–60 EUR/month**

### Tier 3: Educational Licensing (Highest Ceiling, Highest Effort)

Slovak high schools teach *Občianska náuka* (Civic Education). This game is one of the best interactive demonstrations of:
- Coalition mathematics and parliamentary systems
- Economic policy tradeoffs (inflation vs unemployment, deficit vs growth)
- Media ecosystems and disinformation dynamics
- How checks & balances actually work

**Actions:**
- Create a **"Teacher Mode"** — guided scenarios with learning objectives, no free play
- Package 3–5 classroom lesson plans (45-min sessions) around specific eras
- Contact the Slovak civic education community (Učiteľská platforma, Zmudri.sk, EDUpoint)
- Offer school licenses: 50–200 EUR/year per school for teacher mode + lesson materials
- Apply for Slovak educational grants (e.g., Nadácia Orange digital education fund, IUVENTA)

**Realistic timeline:** 3–6 months to build teacher mode, 6–12 months to get first school adoption.
**Expected value:** 5–20 schools at 100 EUR/year = 500–2,000 EUR/year. Grant funding could add 1,000–5,000 EUR.

---

## 4. Marketing Plan

### Phase 1: Launch Push (Month 1–2)

**Budget: 0 EUR. Time: ~10 hours total.**

| Channel | Action | Expected Reach |
|---------|--------|----------------|
| Reddit | Post on r/Slovakia, r/czech, r/webgames, r/incremental_games | 5,000–20,000 views |
| Slovak Twitter/X | Thread about the game with screenshots, tag political commentators | 2,000–10,000 impressions |
| Hacker News | "Show HN" post — angle: game theory + political simulation | 5,000–50,000 views (if it catches) |
| Facebook | Slovak political meme groups (Zomri, etc.) — they love this kind of thing | 3,000–15,000 views |
| Product Hunt | Launch with screenshots + technical angle | 500–3,000 visits |

**Key message:** "Can you survive as Slovak PM? A free political simulator with real coalition math, real politicians, real consequences."

### Phase 2: Sustained Growth (Month 3–6)

- **Content marketing:** Short gameplay clips (screen recordings) for TikTok/Instagram Reels — "I tried to be PM during Matovič's era and this happened" format
- **SEO:** The game is already in Slovak — it will naturally rank for "slovenský politický simulátor" and similar queries
- **Word of mouth:** Shareable results URLs already exist — players share their PM scorecards
- **Media outreach:** Email 3–5 Slovak tech/gaming journalists (Živé.sk, Refresher, Startitup) — "Slovak student built a political simulator with real game theory"
- **University reach:** Share with political science departments at UK Bratislava, EUBA, and Masaryk University (Brno, CZ)

### Phase 3: Czech Expansion (Month 6–12)

Czech speakers can read Slovak, but a localized version dramatically increases appeal:
- Translate UI strings to Czech (the game is ~100 UI strings, not a huge job)
- Add 2–3 Czech political eras (Klaus, Babiš, Fiala)
- Czech market is 10.5M people — roughly doubles the addressable audience
- Post on Czech Reddit (r/czech), Czech political forums
- Same media outreach strategy adapted for Czech outlets

---

## 5. Cost Structure

| Item | Monthly Cost |
|------|-------------|
| Hosting (GitHub Pages) | 0 EUR |
| Domain (optional, e.g., premiersimulator.sk) | ~1 EUR/mo |
| Cloudflare Workers (API proxy) | 0 EUR (free tier) |
| Ko-fi account | 0 EUR |
| AI API costs (if offering pro tier) | 5–15 EUR/mo |
| **Total** | **~6–16 EUR/mo** |

---

## 6. Realistic Financial Projections

### Year 1

| Revenue Source | Low | Mid | High |
|----------------|-----|-----|------|
| Donations (Ko-fi) | 60 EUR | 240 EUR | 600 EUR |
| Premium AI credits | 0 EUR | 180 EUR | 360 EUR |
| Educational licensing | 0 EUR | 0 EUR | 500 EUR |
| Career leverage (internship value) | 0 EUR | 3,000 EUR | 6,000 EUR |
| **Total** | **60 EUR** | **3,420 EUR** | **7,460 EUR** |

### Year 2 (with Czech expansion + teacher mode)

| Revenue Source | Low | Mid | High |
|----------------|-----|-----|------|
| Donations | 120 EUR | 480 EUR | 1,200 EUR |
| Premium AI credits | 120 EUR | 360 EUR | 720 EUR |
| Educational licensing | 500 EUR | 2,000 EUR | 5,000 EUR |
| Grants | 0 EUR | 1,000 EUR | 5,000 EUR |
| Career leverage | 3,000 EUR | 6,000 EUR | 10,000 EUR |
| **Total** | **3,740 EUR** | **9,840 EUR** | **21,920 EUR** |

---

## 7. What This Plan Deliberately Excludes

- **Ads:** Traffic volume won't generate meaningful revenue (<50 EUR/year)
- **Subscriptions:** Market too small for recurring billing friction
- **Mobile app:** Requires significant rework; market doesn't justify App Store costs
- **VC/Investment:** Not a venture-scale opportunity. Keep it lean.
- **Merch:** Cool idea, but at this scale it's a time sink for ~0 profit

---

## 8. Immediate Next Steps (This Month)

1. **Add Ko-fi button** to hub page and game-over screen (1 hour)
2. **Write a Reddit post** for r/Slovakia with screenshots (2 hours)
3. **Create a Show HN post** with technical angle (1 hour)
4. **Update LinkedIn/portfolio** to feature the game prominently (1 hour)
5. **Register premiersimulator.sk** domain if available (10 minutes, ~12 EUR/year)
6. **Set up basic Cloudflare analytics** (real visitor counting, not just localStorage) (1 hour)

**Total time investment for Month 1: ~6 hours. Total cost: ~12 EUR.**

---

*This is a side project, not a startup. The goal is to make enough money to justify the time invested, build career capital, and potentially grow into something bigger if the educational angle takes off. Most hobby games make exactly 0 EUR. Following this plan, the realistic floor is covering your costs, and the realistic ceiling is a meaningful income supplement.*
