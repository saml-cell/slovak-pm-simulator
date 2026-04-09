# Engine Improvements — Game Theory, Economics & Statistics

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Slovak PM Simulator engine with deeper economic modeling, better game theory, and richer statistical systems — all integrated into the existing `advanced.ts` without breaking current mechanics.

**Architecture:** All new mechanics are pure functions in `advanced.ts` called from `game-flow.ts:proceed()`. New state fields added to `GameState` in `types.ts`. Dashboard renders new data from `render/dashboard.ts`. No new files — everything slots into existing structure.

**Tech Stack:** TypeScript, Vite, browser-only (no server)

---

## File Structure

- **Modify:** `src/engine/types.ts` — Add new GameState fields
- **Modify:** `src/engine/advanced.ts` — Add 8 new mechanics, improve 3 existing
- **Modify:** `src/engine/state.ts` — Initialize new fields in `initGame()`
- **Modify:** `src/engine/game-flow.ts` — Wire new mechanics into `proceed()`
- **Modify:** `src/engine/scoring.ts` — Integrate FDI and Okun's law into keyword scoring
- **Modify:** `src/engine/render/dashboard.ts` — Display new metrics (debt-to-GDP, FDI, media cycle, polling)

---

### Task 1: Add New GameState Fields

**Files:**
- Modify: `src/engine/types.ts:251-285`

- [ ] **Step 1: Add new fields to GameState interface**

Add these fields after `euFundsFlow` (line 284):

```typescript
  debtToGdp: number;           // debt as % of GDP — the real fiscal health metric
  fdi: number;                 // foreign direct investment flow (0-10 scale)
  mediaCycle: number;          // 0-1, how much the current story dominates news
  mediaCycleEvent: string;     // headline of the dominant story
  pollApproval: number;        // noisy public polling number (approval + noise)
  pollError: number;           // current polling bias (-5 to +5)
  interestRate: number;        // implicit borrowing cost (1-15%)
  laborParticipation: number;  // % of working-age population in workforce (55-75)
  shapleyPower: Record<string, number>; // coalition partner power index (0-1)
```

- [ ] **Step 2: Verify build compiles**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`
Expected: Build succeeds (new fields are optional in existing code)

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat: add new GameState fields for improved economics and game theory"
```

---

### Task 2: Initialize New Fields in State

**Files:**
- Modify: `src/engine/state.ts:20-57`

- [ ] **Step 1: Add initialization in initGame()**

After `euFundsFlow: 5,` (line 57), add:

```typescript
    debtToGdp: s.econ.gdp > 0 ? (s.econ.debt / s.econ.gdp) * 100 : 50,
    fdi: 5,
    mediaCycle: 0,
    mediaCycleEvent: '',
    pollApproval: s.approval + (Math.random() * 6 - 3),
    pollError: Math.random() * 4 - 2,
    interestRate: s.econ.debt > 60 ? 4.0 : 2.5,
    laborParticipation: 65,
    shapleyPower: {},
```

- [ ] **Step 2: Verify build**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add src/engine/state.ts
git commit -m "feat: initialize new economic and game theory state fields"
```

---

### Task 3: Shapley Power Index for Coalition

**Files:**
- Modify: `src/engine/advanced.ts`

This replaces the simple `leverage = seats/surplus` with proper cooperative game theory. The Shapley value measures each partner's marginal contribution to winning coalitions.

- [ ] **Step 1: Add Shapley value calculation**

Add after the `nashBargaining` function (after line 99):

```typescript
// ═══════════════════════════════════════════════════════════
//  SHAPLEY POWER INDEX — cooperative game theory
// ═══════════════════════════════════════════════════════════
export function computeShapley(G: GameState, era: EraConfig): void {
  const active = era.coalitionPartners.filter(cp => G.cp[cp.id]?.on);
  const n = active.length;
  if (n === 0) return;

  const quota = 76; // majority threshold
  const power: Record<string, number> = {};
  active.forEach(cp => { power[cp.id] = 0; });

  // Enumerate all permutations (n! — feasible for n<=6 coalition partners)
  const factorial = (x: number): number => x <= 1 ? 1 : x * factorial(x - 1);
  const totalPerms = factorial(n);

  function permute(arr: typeof active, l: number): void {
    if (l === n) {
      // Walk the permutation, find each player's marginal contribution
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const prevSum = sum;
        sum += arr[i].seats;
        // Player is pivotal if adding them crosses the quota
        if (prevSum < quota && sum >= quota) {
          power[arr[i].id] += 1 / totalPerms;
        }
      }
      return;
    }
    for (let i = l; i < n; i++) {
      [arr[l], arr[i]] = [arr[i], arr[l]];
      permute(arr, l + 1);
      [arr[l], arr[i]] = [arr[i], arr[l]];
    }
  }

  permute([...active], 0);
  G.shapleyPower = power;
}
```

- [ ] **Step 2: Integrate Shapley into Nash bargaining**

Replace the existing leverage calculation in `nashBargaining` (the line `const leverage = surplus > 0 ? ...`):

```typescript
    // Use Shapley power if computed, fallback to simple leverage
    const shapley = G.shapleyPower[cp.id] ?? 0;
    const leverage = shapley > 0 ? shapley * 4 : (surplus > 0 ? Math.min(3, cp.seats / Math.max(1, surplus)) : 0.5);
```

- [ ] **Step 3: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 4: Commit**

```bash
git add src/engine/advanced.ts
git commit -m "feat: Shapley power index for coalition game theory"
```

---

### Task 4: Debt-to-GDP, Interest Rate & Fiscal Feedback

**Files:**
- Modify: `src/engine/advanced.ts`

Replaces the simple `debt > 60 → stability drag` with proper fiscal dynamics: debt-to-GDP ratio, endogenous interest rates, and debt spiral mechanics.

- [ ] **Step 1: Add debt-to-GDP and interest rate functions**

Add after `deficitDynamics` function:

```typescript
// ═══════════════════════════════════════════════════════════
//  DEBT-TO-GDP RATIO & INTEREST RATE DYNAMICS
// ═══════════════════════════════════════════════════════════
export function fiscalHealth(G: GameState): void {
  // Update debt-to-GDP ratio
  if (G.econ.gdp > 0) {
    G.debtToGdp = (G.econ.debt / G.econ.gdp) * 100;
  }

  // Endogenous interest rate — markets price risk
  // Base rate from EU diplo (ECB access), premium from debt ratio
  const euAccess = (G.diplo.eu ?? 50) / 100;
  const baseRate = 2.0 - euAccess * 1.0; // 1.0% (good EU) to 2.0% (bad EU)
  const riskPremium = G.debtToGdp > 60
    ? (G.debtToGdp - 60) * 0.08 // 0.08% per point above 60%
    : 0;
  const deficitPremium = G.econ.deficit > 3
    ? (G.econ.deficit - 3) * 0.15
    : 0;

  const targetRate = Math.max(0.5, Math.min(12, baseRate + riskPremium + deficitPremium));
  // Rates adjust gradually (bond markets have inertia)
  G.interestRate += (targetRate - G.interestRate) * 0.15;

  // Interest payments eat into deficit (debt servicing cost)
  const interestCost = G.econ.debt * (G.interestRate / 100) / 12;
  G.econ.deficit += interestCost * 0.1; // monthly fraction of annual cost

  // Debt spiral detection — if interest > growth, debt becomes unsustainable
  if (G.interestRate > G.econ.gdpGrowth + 2 && G.debtToGdp > 80) {
    G.stability -= 0.5;
    G.approval -= 0.3;
  }
}
```

- [ ] **Step 2: Update existing econFeedback to use debt-to-GDP**

In `econFeedback`, replace the debt anxiety block:

```typescript
  // Debt-to-GDP anxiety (replaces simple threshold)
  if (G.debtToGdp > 60) {
    const severity = (G.debtToGdp - 60) * 0.06;
    G.stability -= severity;
    // Rating agency warnings at key thresholds
    if (G.debtToGdp > 90) G.approval -= 0.5;
  }
```

- [ ] **Step 3: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 4: Commit**

```bash
git add src/engine/advanced.ts
git commit -m "feat: debt-to-GDP ratio, interest rate dynamics, and fiscal feedback"
```

---

### Task 5: FDI Model (Foreign Direct Investment)

**Files:**
- Modify: `src/engine/advanced.ts`

Slovakia's economy depends heavily on FDI (automotive: VW, KIA, PSA). This models investment attraction based on stability, EU relations, tax policy, and labor costs.

- [ ] **Step 1: Add FDI function**

```typescript
// ═══════════════════════════════════════════════════════════
//  FOREIGN DIRECT INVESTMENT — capital flows
// ═══════════════════════════════════════════════════════════
export function fdiDynamics(G: GameState): void {
  // FDI attracted by: stability, EU relations, low taxes, low wages, rule of law
  const stabilityFactor = G.stability / 100;
  const euFactor = (G.diplo.eu ?? 50) / 100;
  const taxFactor = Math.max(0, 1 - (G.stances.ekonomika ?? 0) * 0.08); // left = higher tax = less FDI
  const ruleFactor = (G.social.corrupt ?? 50) < 30 ? 0.7 : 1.0; // corruption scares investors
  const wageFactor = G.econ.minW < 700 ? 1.1 : G.econ.minW > 1000 ? 0.8 : 1.0;

  const targetFdi = 10 * stabilityFactor * euFactor * taxFactor * ruleFactor * wageFactor;
  // FDI adjusts slowly (investment decisions take time)
  G.fdi += (targetFdi - G.fdi) * 0.08;
  G.fdi = clamp(G.fdi, 0, 10);

  // FDI effects on economy
  G.econ.gdpGrowth += G.fdi * 0.03;      // each billion in FDI adds ~0.03% growth
  G.econ.unemp -= G.fdi * 0.015;          // FDI creates jobs
  G.econ.unemp = Math.max(2, G.econ.unemp);

  // FDI shock — sudden withdrawal if conditions deteriorate
  if (G.fdi < 2 && stabilityFactor < 0.3) {
    G.econ.unemp += 0.3;
    G.econ.gdpGrowth -= 0.2;
  }
}
```

- [ ] **Step 2: Add FDI keyword effects to scoring.ts**

In `scoring.ts:kwScore()`, after the consequence section (around line 134), add:

```typescript
  // FDI-sensitive keywords
  const fdiPositive = ['investícia', 'invest', 'priemysel', 'fabrika', 'automobilka', 'startup', 'inovácia', 'výskum'];
  const fdiNegative = ['znárodniť', 'znárodnenie', 'regulácia', 'zákaz', 'protekcionizmus'];
  if (fdiPositive.some(k => low.includes(k))) {
    a.econFx.gdpGrowth = (a.econFx.gdpGrowth || 0) + 0.2;
  }
  if (fdiNegative.some(k => low.includes(k))) {
    a.econFx.gdpGrowth = (a.econFx.gdpGrowth || 0) - 0.3;
  }
```

- [ ] **Step 3: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 4: Commit**

```bash
git add src/engine/advanced.ts src/engine/scoring.ts
git commit -m "feat: FDI model — foreign investment dynamics for Slovak economy"
```

---

### Task 6: Okun's Law & Phillips Curve Improvements

**Files:**
- Modify: `src/engine/advanced.ts`

Replace the simple linear relationships with proper economic relationships.

- [ ] **Step 1: Add Okun's Law function**

```typescript
// ═══════════════════════════════════════════════════════════
//  OKUN'S LAW — GDP-unemployment relationship
// ═══════════════════════════════════════════════════════════
export function okunsLaw(G: GameState): void {
  // Okun's coefficient for Slovakia (~0.3): 1% below potential GDP = +0.3% unemployment
  const potentialGrowth = 2.5; // Slovakia's long-run potential
  const gap = G.econ.gdpGrowth - potentialGrowth;

  if (gap < 0) {
    // Below potential: unemployment rises
    G.econ.unemp -= gap * 0.3; // negative gap → positive unemployment change
  } else {
    // Above potential: unemployment falls, but with diminishing returns
    G.econ.unemp -= gap * 0.2;
  }
  G.econ.unemp = clamp(G.econ.unemp, 2, 30);

  // Natural rate of unemployment (NAIRU) ~6% for Slovakia
  // When below NAIRU, inflation accelerates (expectations-augmented Phillips curve)
  const nairu = 6.0;
  if (G.econ.unemp < nairu) {
    const gapBelowNairu = nairu - G.econ.unemp;
    G.econ.infl += gapBelowNairu * 0.12; // tighter labor market → wage pressure → inflation
  } else if (G.econ.unemp > nairu + 4) {
    // Very high unemployment → deflationary pressure
    G.econ.infl -= (G.econ.unemp - nairu - 4) * 0.05;
  }
  G.econ.infl = clamp(G.econ.infl, 0, 25);
}
```

- [ ] **Step 2: Remove redundant Phillips curve from econFeedback**

In the existing `econFeedback` function, remove the GDP→unemployment and Phillips curve blocks (they're now in `okunsLaw`):

Remove:
```typescript
  // GDP growth positive feedback
  if (G.econ.gdpGrowth > 2) {
    G.approval += (G.econ.gdpGrowth - 2) * 0.4;
    G.econ.unemp = Math.max(2, G.econ.unemp - G.econ.gdpGrowth * 0.04);
  }

  // Phillips curve — high growth feeds inflation
  if (G.econ.gdpGrowth > 3) {
    G.econ.infl += (G.econ.gdpGrowth - 3) * 0.08;
  }
```

Replace with:
```typescript
  // GDP growth → approval feedback (Okun handles unemployment/inflation now)
  if (G.econ.gdpGrowth > 2) {
    G.approval += (G.econ.gdpGrowth - 2) * 0.4;
  }
```

- [ ] **Step 3: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 4: Commit**

```bash
git add src/engine/advanced.ts
git commit -m "feat: Okun's law and expectations-augmented Phillips curve"
```

---

### Task 7: Media Cycle & News Decay

**Files:**
- Modify: `src/engine/advanced.ts`

News stories dominate attention then fade. Big events amplify approval swings, quiet periods let the cycle reset.

- [ ] **Step 1: Add media cycle function**

```typescript
// ═══════════════════════════════════════════════════════════
//  MEDIA CYCLE — news salience and decay
// ═══════════════════════════════════════════════════════════
export function mediaCycleTick(G: GameState, eventTier: string, eventHeadline: string): number {
  // New event intensity based on tier
  const tierIntensity: Record<string, number> = {
    crisis: 0.9,
    consequence: 0.7,
    situation: 0.5,
    open: 0.2,
    quiet: 0.0,
  };
  const newIntensity = tierIntensity[eventTier] ?? 0.3;

  // Media cycle: new story displaces old one if more intense
  if (newIntensity > G.mediaCycle * 0.6) {
    G.mediaCycle = Math.min(1, G.mediaCycle * 0.3 + newIntensity);
    G.mediaCycleEvent = eventHeadline;
  } else {
    // Existing story decays
    G.mediaCycle *= 0.7;
  }

  // Media amplification: high cycle = bigger public reaction to policy
  // Low cycle = public is distracted, policy has less impact
  return 0.6 + G.mediaCycle * 0.6; // 0.6 to 1.2 multiplier
}
```

- [ ] **Step 2: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add src/engine/advanced.ts
git commit -m "feat: media cycle with news salience and decay"
```

---

### Task 8: Noisy Polling

**Files:**
- Modify: `src/engine/advanced.ts`

The player shouldn't see exact approval — they see a noisy poll that can mislead.

- [ ] **Step 1: Add polling function**

```typescript
// ═══════════════════════════════════════════════════════════
//  NOISY POLLING — what the player sees vs. reality
// ═══════════════════════════════════════════════════════════
export function updatePolling(G: GameState): void {
  // Polling error drifts slowly (methodological bias)
  G.pollError += gaussRand() * 0.3;
  G.pollError = clamp(G.pollError, -5, 5);

  // Poll result = actual approval + systematic bias + random noise
  const noise = gaussRand() * 2; // ±2% random sampling error
  G.pollApproval = clamp(G.approval + G.pollError + noise);

  // Polls are more accurate when sample is large (stability proxy)
  if (G.stability > 70) {
    G.pollError *= 0.9; // stable country → better polling infrastructure
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add src/engine/advanced.ts
git commit -m "feat: noisy polling system — player sees imperfect information"
```

---

### Task 9: Labor Market Dynamics

**Files:**
- Modify: `src/engine/advanced.ts`

Track labor force participation — brain drain and immigration affect Slovakia's workforce.

- [ ] **Step 1: Add labor participation function**

```typescript
// ═══════════════════════════════════════════════════════════
//  LABOR MARKET — participation and brain drain
// ═══════════════════════════════════════════════════════════
export function laborMarketTick(G: GameState): void {
  // Brain drain: low wages + EU membership → emigration
  const wagePull = G.econ.minW < 600 ? -0.1 : G.econ.minW > 900 ? 0.05 : 0;
  // High unemployment discourages participation
  const discouragement = G.econ.unemp > 10 ? -(G.econ.unemp - 10) * 0.02 : 0;
  // EU relations affect free movement (higher EU → easier to leave but also attract)
  const euEffect = (G.diplo.eu ?? 50) > 70 ? -0.02 : 0; // good EU = easier brain drain
  // Growth attracts workers back
  const growthPull = G.econ.gdpGrowth > 3 ? 0.05 : 0;

  G.laborParticipation += wagePull + discouragement + euEffect + growthPull;
  // Mean reversion toward 65%
  G.laborParticipation += (65 - G.laborParticipation) * 0.02;
  G.laborParticipation = clamp(G.laborParticipation, 50, 78);

  // Participation affects potential output
  // Low participation → labor shortage → wage pressure → inflation
  if (G.laborParticipation < 60) {
    G.econ.infl += (60 - G.laborParticipation) * 0.02;
    G.econ.gdpGrowth -= (60 - G.laborParticipation) * 0.01;
  }
  // High participation → more workers → lower wage pressure
  if (G.laborParticipation > 70) {
    G.econ.unemp = Math.max(2, G.econ.unemp - 0.05);
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add src/engine/advanced.ts
git commit -m "feat: labor market dynamics with brain drain and participation"
```

---

### Task 10: Wire All New Mechanics into proceed()

**Files:**
- Modify: `src/engine/game-flow.ts:62-212`

- [ ] **Step 1: Add imports**

At the top of `game-flow.ts`, update the import from `advanced.ts` to include new functions:

```typescript
import { applyMomentum, socialInfluence, econFeedback, policyConsistency, oppositionMove, nashBargaining, simulateElection, businessCycleTick, deficitDynamics, euFundsLink, smartMinWage, econCrisisCheck, incumbencyPenalty, crisisFatigueTick, politicalCapitalTick, diploFeedback, computeShapley, fiscalHealth, fdiDynamics, okunsLaw, mediaCycleTick, updatePolling, laborMarketTick } from './advanced';
```

- [ ] **Step 2: Wire new mechanics into proceed()**

In `proceed()`, after the existing `// ═══ ECONOMICS ENGINE ═══` block and before the `// President transition flags` block, add:

```typescript
  // ═══ NEW MECHANICS ═══
  // Okun's law (replaces redundant GDP→unemployment from old econFeedback)
  okunsLaw(G);
  // FDI dynamics
  fdiDynamics(G);
  // Fiscal health — debt-to-GDP and interest rates
  fiscalHealth(G);
  // Labor market
  laborMarketTick(G);
  // Media cycle — returns amplification multiplier (used for logging, not re-applied)
  const _mediaAmp = mediaCycleTick(G, eventTier, G.event?.headline || '');
  // Noisy polling
  updatePolling(G);
  // Shapley power index (before Nash bargaining later in the function)
  computeShapley(G, era);
```

- [ ] **Step 3: Apply media amplification to approval delta**

Earlier in `proceed()`, where approval is calculated (the `applyMomentum` line), wrap with media amplification. Replace:

```typescript
  G.approval = Math.max(0, Math.min(100, G.approval + applyMomentum(G, a.aD * ir * fatigueMult)));
```

With:

```typescript
  const mediaAmp = mediaCycleTick(G, eventTier, G.event?.headline || '');
  G.approval = Math.max(0, Math.min(100, G.approval + applyMomentum(G, a.aD * ir * fatigueMult * mediaAmp)));
```

And remove the duplicate `mediaCycleTick` call from the "NEW MECHANICS" block (replace `const _mediaAmp = mediaCycleTick(...)` with just a comment `// mediaCycleTick called above with approval delta`).

- [ ] **Step 4: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add src/engine/game-flow.ts
git commit -m "feat: wire all new mechanics into game loop"
```

---

### Task 11: Update Dashboard with New Metrics

**Files:**
- Modify: `src/engine/render/dashboard.ts`

- [ ] **Step 1: Update renderEconomy() to show new metrics**

In `renderEconomy()`, after the EU funds row, add:

```typescript
    <div class="economy-row"><span class="economy-label">Dlh/HDP</span><span class="economy-value" style="color:${G.debtToGdp > 60 ? G.debtToGdp > 90 ? 'var(--red)' : 'var(--yellow)' : 'var(--green)'}">${G.debtToGdp.toFixed(1)}%</span></div>
    <div class="economy-row"><span class="economy-label">Úroková sadzba</span><span class="economy-value" style="color:${G.interestRate > 5 ? 'var(--red)' : G.interestRate > 3 ? 'var(--yellow)' : 'var(--green)'}">${G.interestRate.toFixed(1)}%</span></div>
    <div class="economy-row"><span class="economy-label">Zahraničné invest.</span><span class="economy-value" style="color:${G.fdi > 5 ? 'var(--green)' : G.fdi > 2 ? 'var(--yellow)' : 'var(--red)'}">${G.fdi.toFixed(1)} ${big}/rok</span></div>
    <div class="economy-row"><span class="economy-label">Participácia</span><span class="economy-value">${G.laborParticipation.toFixed(1)}%</span></div>
```

- [ ] **Step 2: Update renderAdvancedMetrics() with media and polling**

In `renderAdvancedMetrics()`, after the momentum row, add:

```typescript
    <div class="economy-row"><span class="economy-label">Mediálny cyklus</span><span class="economy-value" style="color:${G.mediaCycle > 0.6 ? 'var(--red)' : G.mediaCycle > 0.3 ? 'var(--yellow)' : 'var(--green)'}">${G.mediaCycle > 0.5 ? '🔥 Horúce' : G.mediaCycle > 0.2 ? '📰 Aktívne' : '😴 Pokojné'}</span></div>
    <div class="economy-row"><span class="economy-label">Prieskumy</span><span class="economy-value" style="color:${G.pollApproval > 50 ? 'var(--green)' : G.pollApproval > 35 ? 'var(--yellow)' : 'var(--red)'}">~${Math.round(G.pollApproval)}%</span></div>
```

- [ ] **Step 3: Show Shapley power in coalition panel**

In `renderCoalition()`, after the patience stat, add the Shapley power display:

```typescript
        ${G.shapleyPower[cp.id] !== undefined ? `<div class="partner-stat"><div class="partner-stat-label">Vyj. sila</div><div class="partner-stat-value">${Math.round((G.shapleyPower[cp.id] || 0) * 100)}%</div></div>` : ''}
```

- [ ] **Step 4: Build and verify**

Run: `cd /home/samko/Game/Game/vite-app && npx vite build 2>&1 | tail -3`

- [ ] **Step 5: Commit**

```bash
git add src/engine/render/dashboard.ts
git commit -m "feat: display new metrics — debt/GDP, FDI, polling, media cycle, Shapley power"
```

---

### Task 12: Final Build, Sync, and Balance Check

**Files:**
- Modify: `public/eras/*.json` (sync from src)

- [ ] **Step 1: Sync eras and full rebuild**

```bash
cd /home/samko/Game/Game/vite-app
cp src/eras/*.json public/eras/
npx vite build
```

- [ ] **Step 2: Verify JS bundle compiles and is reasonable size**

Expected: Bundle ~68-72KB (up from 66KB), clean build, no errors.

- [ ] **Step 3: Commit final build**

```bash
git add -A
git commit -m "feat: complete engine improvements — game theory, economics, statistics"
```
