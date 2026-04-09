# Slovenský Politický Simulátor 🇸🇰

**Slovak Political Simulator** — a browser-based political strategy game where you step into the shoes of the Slovak Prime Minister across 8 historical eras spanning 1994 to 2027.

> Built with TypeScript + Vite. Zero runtime dependencies. ~73 KB JS bundle.

---

## Screenshot

![Screenshot placeholder](docs/screenshot.png)

*Screenshot coming soon — run locally with `npm run dev`*

---

## Features

- **8 Playable Eras** — 33 years of Slovak political history, from Mečiar's authoritarian rule to the post-assassination-attempt Fico IV government
- **48-Month Gameplay** per era with real historical events triggering at the correct dates
- **12 Unique Personas** per era (96 total) with 180 era-specific quotes
- **AI Policy Analysis** — pluggable backend: Puter.js (free), Groq (free), Anthropic (paid), or offline keyword scoring when no key is present
- **Nash Bargaining Coalition Mechanics** with Shapley power index for realistic coalition negotiations
- **Economic Simulation** — Okun's Law, business cycles, FDI dynamics, and EU funds modelling
- **Checks & Balances** — parliament votes, constitutional court rulings, and presidential veto mechanics
- **Monte Carlo Election Simulation** using the D'Hondt proportional method
- **Press Coverage System** — reactions from three media outlets spanning the left/center/right spectrum
- **Interactive Regional Map** of Slovakia across all 8 regions
- **Policy Consequence Chains** — delayed, probabilistic downstream effects of your decisions
- **Bug Report System** and in-game analytics dashboard

---

## The 8 Eras

| # | Era | Period | Theme |
|---|-----|--------|-------|
| 1 | Mečiar | 1994–1998 | Authoritarian governance, EU/NATO exclusion |
| 2 | Dzurinda | 1998–2006 | EU & NATO accession, structural reforms |
| 3 | Fico II | 2012–2016 | Single-party majority, social spending |
| 4 | Fico III | 2016–2018 | Kučiak murder, mass protests |
| 5 | Pellegrini | 2018–2020 | Post-protest transitional government |
| 6 | Matovič | 2020–2021 | COVID crisis, mass testing programme |
| 7 | Heger | 2021–2023 | Ukraine war, energy crisis, coalition collapse |
| 8 | Fico IV | 2023–2027 | Return to power, assassination attempt |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict) |
| Build tool | Vite 8 |
| Runtime deps | **None** |
| AI backends | Puter.js / Groq / Anthropic (all optional) |
| Bundle size | ~73 KB (production) |
| Target | Modern browsers, no install required |

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
# Clone the repo
git clone https://github.com/your-username/slovak-pm-simulator.git
cd slovak-pm-simulator

# Install dev dependencies (TypeScript + Vite only)
npm install

# Start the development server
npm run dev

# Build for production
npm run build

# Preview the production build
npm run preview
```

Open `http://localhost:5173` for the hub/landing page, then navigate to `game.html` to start playing.

### Optional: AI Integration

Set an environment variable or enter your key in-game settings:

| Provider | Cost | Notes |
|----------|------|-------|
| Puter.js | Free | No API key needed |
| Groq | Free tier | Fast inference |
| Anthropic | Paid | Claude models |

If no key is configured, the game falls back to offline keyword scoring — fully playable without any API key.

---

## Project Structure

```
vite-app/
├── index.html          # Hub / landing page
├── game.html           # Main game page
├── src/
│   ├── engine/         # Core game engine (TypeScript)
│   │   ├── economics.ts       # Okun's Law, business cycles, FDI
│   │   ├── coalition.ts       # Nash bargaining + Shapley index
│   │   ├── election.ts        # Monte Carlo + D'Hondt simulation
│   │   ├── policy.ts          # Consequence chains
│   │   └── checks.ts          # Parliament, court, president
│   ├── eras/           # 8 era configs (JSON)
│   │   ├── meciar.json
│   │   ├── dzurinda.json
│   │   └── ...
│   └── styles/         # CSS
├── public/             # Static assets, fonts
├── package.json
└── vite.config.ts
```

---

## Game Mechanics Overview

### Policy Decisions
Each month you face policy decisions drawn from historically grounded event pools. Choices affect approval ratings, economic indicators, coalition stability, and media coverage — often with delayed consequences that surface months later.

### Economic Model
The economic engine models GDP growth, unemployment (via Okun's Law), inflation, FDI inflows, and EU fund absorption. Business cycles mean that inherited conditions from the previous era carry forward.

### Coalition Politics
Forming a government requires negotiating with potential partners. The Nash bargaining framework calculates mutually acceptable coalition agreements; the Shapley power index determines each party's real leverage, which affects ministerial allocation and policy veto power.

### Elections
When an era ends or the coalition collapses, elections are simulated using Monte Carlo sampling over voter preference distributions, with seats allocated by the D'Hondt method — the actual system used in Slovak parliamentary elections.

### Checks & Balances
Legislation can be blocked by the Constitutional Court, vetoed by the President, or fail a parliamentary confidence vote. Managing these constraints is as important as managing public approval.

---

## AI Integration

The AI analysis layer is modular and provider-agnostic:

```
User Policy Input
       │
       ▼
 [Offline Keyword Scorer]  ← always available, no API needed
       │
 [Optional LLM Layer]
   ├── Puter.js  (free, no key)
   ├── Groq      (free tier)
   └── Anthropic (paid, Claude)
       │
       ▼
 Policy Impact Assessment + Contextual Advice
```

The offline scorer uses era-specific keyword weights so the game remains fully functional and competitive without any external API calls.

---

## Contributing

Contributions are welcome. Suggested areas:

- Additional era events or persona quotes (edit `src/eras/*.json`)
- Economic model improvements
- Localization (the codebase is Slovak-first but structured for i18n)
- UI/UX improvements

Please open an issue before starting large changes.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Slovenský Politický Simulátor is an educational project. All historical references are for simulation and learning purposes.*
