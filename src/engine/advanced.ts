/**
 * Advanced Game Mechanics — Game Theory, Statistics, ML-inspired systems
 */
import type { EraConfig, GameState } from './types';

// ═══════════════════════════════════════════════════════════
//  TUNING CONSTANTS (adjust for balance)
// ═══════════════════════════════════════════════════════════
const MOMENTUM_DECAY = 0.8;
const MOMENTUM_GAIN = 0.2;
const MOMENTUM_AMP = 0.5;
const SOCIAL_PULL = 0.08;
const SOCIAL_DRAG = 2;
const UNEMP_DRAG_THRESHOLD = 8;
const INFL_DRAG_THRESHOLD = 5;
const FLIP_FLOP_PENALTY = -4;
const CONSISTENCY_BONUS = 3;
const OPPOSITION_DECAY = 0.9;
const OPPOSITION_GROWTH = 5;
const ELECTION_RUNS = 500;

function clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }
function gaussRand(): number {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ═══════════════════════════════════════════════════════════
//  1. APPROVAL MOMENTUM & VOLATILITY
// ═══════════════════════════════════════════════════════════
export function applyMomentum(G: GameState, rawDelta: number): number {
  // Update momentum — same direction compounds, opposite decays
  if (rawDelta !== 0) {
    G.momentum = clamp(G.momentum * MOMENTUM_DECAY + Math.sign(rawDelta) * MOMENTUM_GAIN, -1, 1);
  } else {
    G.momentum *= MOMENTUM_DECAY;
  }

  // Amplify delta by momentum (same direction = boost)
  const amp = (Math.sign(rawDelta) === Math.sign(G.momentum))
    ? 1 + Math.abs(G.momentum) * MOMENTUM_AMP
    : 1 - Math.abs(G.momentum) * 0.2;

  // Volatility from polarization (stddev of persona scores)
  const scores = Object.values(G.pScores);
  if (scores.length > 1) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stddev = Math.sqrt(variance);
    const volatility = stddev > 20 ? 1 + (stddev - 20) * 0.015 : 1;
    return rawDelta * amp * volatility;
  }
  return rawDelta * amp;
}

// ═══════════════════════════════════════════════════════════
//  2. COALITION GAME THEORY (Nash Bargaining)
// ═══════════════════════════════════════════════════════════
export function nashBargaining(G: GameState, era: EraConfig): void {
  const totalSeats = era.coalitionPartners.reduce((s, cp) => s + (G.cp[cp.id]?.on ? cp.seats : 0), 0);
  const surplus = totalSeats - 76; // seats above majority threshold

  era.coalitionPartners.forEach(cp => {
    const p = G.cp[cp.id];
    if (!p || !p.on) return;

    // Leverage: how critical is this partner? Higher = more power
    // Use Shapley power if computed, fallback to simple leverage
    const shapley = G.shapleyPower[cp.id] ?? 0;
    const leverage = shapley > 0 ? shapley * 4 : (surplus > 0 ? Math.min(3, cp.seats / Math.max(1, surplus)) : 0.5);

    // Patience drain scales with leverage — powerful partners drain faster when unhappy
    // Bad polls make partners nervous
    const pollPenalty = G.pollApproval < 30 ? (30 - G.pollApproval) * 0.05 : 0;
    if (p.sat < 50) {
      p.pat -= (50 - p.sat) * (0.1 + leverage * 0.08) + pollPenalty;
    }

    // Dynamic demand frequency — leveraged partners demand more often
    const effectiveFreq = Math.max(2, cp.freq - Math.floor(leverage));
    if (!p.dem && (G.month - p.lastD) >= effectiveFreq) {
      const ds = era.demands.filter(d => d.partner === cp.id);
      if (ds.length) {
        p.dem = ds[Math.floor(Math.random() * ds.length)].text;
        p.lastD = G.month;
      }
    }

    // Threat behavior — partners with low patience and high leverage are dangerous
    const threatThreshold = 10 + leverage * 12;
    if (p.pat <= threatThreshold && cp.id !== era.coalitionPartners[0]?.id) {
      // Small chance of actually leaving based on leverage
      if (p.pat <= 0) {
        p.on = 0; p.sat = 10;
        G.sScores[cp.id] = 10;
        G.stability = Math.max(0, G.stability - 20 - leverage * 5);
        G.coalition = Math.max(0, G.coalition - 15);
        G.flags[cp.id + '_kicked'] = true;
      }
    }
  });
}

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
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const prevSum = sum;
        sum += arr[i].seats;
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

// ═══════════════════════════════════════════════════════════
//  3. PERSONA SOCIAL NETWORK INFLUENCE
// ═══════════════════════════════════════════════════════════
export function socialInfluence(G: GameState, era: EraConfig): void {
  const newScores: Record<string, number> = {};

  era.personas.forEach(p => {
    const current = G.pScores[p.id] || 50;
    let neighborSum = 0, neighborCount = 0;

    // Find neighbors: same region or same lean
    era.personas.forEach(other => {
      if (other.id === p.id) return;
      if (other.region === p.region || other.lean === p.lean) {
        const s = G.pScores[other.id] || 50;
        neighborSum += s;
        neighborCount++;
        // Drag effect — strongly negative neighbor pulls down
        if (s < 25) neighborSum -= SOCIAL_DRAG;
      }
    });

    if (neighborCount > 0) {
      const neighborAvg = neighborSum / neighborCount;
      newScores[p.id] = current + (neighborAvg - current) * SOCIAL_PULL;
    } else {
      newScores[p.id] = current;
    }
  });

  // Apply
  Object.entries(newScores).forEach(([id, v]) => {
    G.pScores[id] = clamp(v, 5, 95);
  });
}

// ═══════════════════════════════════════════════════════════
//  4. ECONOMIC FEEDBACK LOOPS
// ═══════════════════════════════════════════════════════════
export function econFeedback(G: GameState): void {
  // Unemployment drags approval
  if (G.econ.unemp > UNEMP_DRAG_THRESHOLD) {
    G.approval -= (G.econ.unemp - UNEMP_DRAG_THRESHOLD) * 0.3;
  }

  // Inflation penalty on persona scores
  if (G.econ.infl > INFL_DRAG_THRESHOLD) {
    const penalty = (G.econ.infl - INFL_DRAG_THRESHOLD) * 0.3;
    Object.keys(G.pScores).forEach(id => {
      G.pScores[id] = Math.max(5, G.pScores[id] - penalty);
    });
  }

  // GDP growth → approval feedback (Okun's law handles unemployment/inflation now)
  if (G.econ.gdpGrowth > 2) {
    G.approval += (G.econ.gdpGrowth - 2) * 0.4;
  }

  // Debt-to-GDP anxiety (replaces simple threshold)
  if (G.debtToGdp > 60) {
    const severity = (G.debtToGdp - 60) * 0.06;
    G.stability -= severity;
    if (G.debtToGdp > 90) G.approval -= 0.5;
  }

  // Clamp results
  G.approval = clamp(G.approval);
  G.stability = clamp(G.stability);
}

// ═══════════════════════════════════════════════════════════
//  5. POLICY MEMORY & CONSISTENCY SCORING
// ═══════════════════════════════════════════════════════════
const THEME_KEYWORDS: Record<string, string[]> = {
  eu: ['eu', 'nato', 'brusel', 'európ', 'ukraine', 'ukrajin'],
  rusko: ['russia', 'rusko', 'moskva', 'mier', 'peace'],
  ekonomika: ['invest', 'startup', 'biznis', 'podnik', 'dan', 'daň', 'tax'],
  social: ['social', 'pension', 'dochodok', 'dôchod', 'sociáln', 'plat', 'mzd'],
  media: ['media', 'rtvs', 'stvr', 'tlač', 'transparentn', 'slobod'],
  justicia: ['súd', 'justíci', 'reform', 'právny štát'],
  migracia: ['migráci', 'migrant', 'azyl', 'utečen'],
  identita: ['sovereign', 'suverenita', 'národn', 'tradíci'],
};

export function policyConsistency(G: GameState, policy: string): { bonus: number; flipPenalty: number } {
  const low = policy.toLowerCase();
  const detectedThemes: string[] = [];

  Object.entries(THEME_KEYWORDS).forEach(([theme, kws]) => {
    if (kws.some(k => low.includes(k))) detectedThemes.push(theme);
  });

  // Store themes (keep last 20)
  G.policyThemes.push(...detectedThemes);
  if (G.policyThemes.length > 20) G.policyThemes = G.policyThemes.slice(-20);

  // Consistency bonus: most frequent theme appears 5+ times
  let bonus = 0;
  if (G.policyThemes.length >= 5) {
    const freq: Record<string, number> = {};
    G.policyThemes.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    const maxFreq = Math.max(...Object.values(freq));
    if (maxFreq >= 5) bonus = CONSISTENCY_BONUS;
  }

  // Flip-flop detection: did this policy push a stance opposite to recent trend?
  let flipPenalty = 0;
  detectedThemes.forEach(theme => {
    const stance = G.stances[theme];
    if (stance !== undefined && Math.abs(stance) >= 2) {
      // Check if current policy opposes the established stance direction
      const themeKws = THEME_KEYWORDS[theme];
      const pushesPositive = themeKws.some(k => low.includes(k));
      if (pushesPositive && stance < -2) flipPenalty += FLIP_FLOP_PENALTY;
      else if (!pushesPositive && stance > 2) flipPenalty += FLIP_FLOP_PENALTY;
    }
  });

  return { bonus, flipPenalty: Math.max(flipPenalty, -8) }; // cap total penalty
}

// ═══════════════════════════════════════════════════════════
//  6. ELECTION SIMULATION (Monte Carlo + D'Hondt)
// ═══════════════════════════════════════════════════════════
interface ElectionResult {
  seats: Record<string, { mean: number; low: number; high: number }>;
  winProbability: number;
  narrative: string;
}

function dhondt(votes: Record<string, number>, totalSeats: number): Record<string, number> {
  const seats: Record<string, number> = {};
  Object.keys(votes).forEach(p => { seats[p] = 0; });

  for (let i = 0; i < totalSeats; i++) {
    let bestParty = '', bestQuotient = -1;
    Object.entries(votes).forEach(([party, v]) => {
      const q = v / (seats[party] + 1);
      if (q > bestQuotient) { bestQuotient = q; bestParty = party; }
    });
    if (bestParty) seats[bestParty]++;
  }
  return seats;
}

export function simulateElection(G: GameState, era: EraConfig): ElectionResult {
  // Base vote shares from game state
  const baseShares: Record<string, number> = {};
  const coalitionIds = new Set(era.coalitionPartners.map(cp => cp.id));
  const partyApproval = G.approval / 100;

  Object.entries(G.parl).forEach(([party, origSeats]) => {
    if (origSeats <= 0) return;
    const isCoalition = coalitionIds.has(party);
    // Coalition parties scale with approval, opposition inversely
    const base = (origSeats / 150) * 100;
    if (isCoalition) {
      baseShares[party] = base * (0.6 + partyApproval * 0.8);
    } else {
      baseShares[party] = base * (0.6 + (1 - partyApproval) * 0.8);
    }
  });

  // Run Monte Carlo
  const allRuns: Record<string, number[]> = {};
  Object.keys(baseShares).forEach(p => { allRuns[p] = []; });
  let coalitionWins = 0;

  const uncertainty = 3 + (100 - G.stability) * 0.04;

  for (let run = 0; run < ELECTION_RUNS; run++) {
    const votes: Record<string, number> = {};
    Object.entries(baseShares).forEach(([party, base]) => {
      const noisy = Math.max(0, base + gaussRand() * uncertainty);
      if (noisy >= 5) votes[party] = noisy; // 5% threshold
    });

    const seats = dhondt(votes, 150);
    Object.entries(seats).forEach(([party, s]) => {
      allRuns[party].push(s);
    });

    // Check if coalition wins
    let coalSeats = 0;
    coalitionIds.forEach(id => { coalSeats += seats[id] || 0; });
    if (coalSeats >= 76) coalitionWins++;
  }

  // Compute stats
  const result: ElectionResult['seats'] = {};
  Object.entries(allRuns).forEach(([party, runs]) => {
    if (!runs.length) return;
    runs.sort((a, b) => a - b);
    result[party] = {
      mean: Math.round(runs.reduce((a, b) => a + b, 0) / runs.length),
      low: runs[Math.floor(runs.length * 0.05)],
      high: runs[Math.floor(runs.length * 0.95)],
    };
  });

  const winProb = coalitionWins / ELECTION_RUNS;
  let narrative: string;
  if (winProb > 0.8) narrative = 'Koalícia smeruje k presvedčivému víťazstvu. Prieskumy ukazujú jasnú väčšinu.';
  else if (winProb > 0.5) narrative = 'Tesné preteky. Koalícia má miernu výhodu ale výsledok je neistý.';
  else if (winProb > 0.2) narrative = 'Opozícia vedie. Koalícia potrebuje zázrak alebo chybu súpera.';
  else narrative = 'Drvivá porážka sa blíži. Voliči odmietli vládnutie koalície.';

  return { seats: result, winProbability: winProb, narrative };
}

// ═══════════════════════════════════════════════════════════
//  MEDIA CYCLE — news salience and decay
// ═══════════════════════════════════════════════════════════
export function mediaCycleTick(G: GameState, eventTier: string, eventHeadline: string): number {
  const tierIntensity: Record<string, number> = {
    crisis: 0.9,
    consequence: 0.7,
    situation: 0.5,
    open: 0.2,
    quiet: 0.0,
  };
  const newIntensity = tierIntensity[eventTier] ?? 0.3;

  // New story displaces old one if more intense
  if (newIntensity > G.mediaCycle * 0.6) {
    G.mediaCycle = Math.min(1, G.mediaCycle * 0.3 + newIntensity);
    G.mediaCycleEvent = eventHeadline;
  } else {
    G.mediaCycle *= 0.7; // existing story decays
  }

  // Return media amplification multiplier
  // High cycle = bigger public reaction, low = public distracted
  return 0.6 + G.mediaCycle * 0.6; // 0.6 to 1.2
}

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

// ═══════════════════════════════════════════════════════════
//  7. OPPOSITION STRATEGY AI
// ═══════════════════════════════════════════════════════════
export function oppositionMove(G: GameState, era: EraConfig): { action: string; effect: { approval: number; stability: number; coalition: number } } {
  // Update opposition pressure — grows when player is weak, decays when strong
  const avg = (G.approval + G.stability + G.coalition) / 3;
  if (avg < 40) G.oppositionPressure = Math.min(100, G.oppositionPressure + OPPOSITION_GROWTH);
  else G.oppositionPressure *= OPPOSITION_DECAY;

  const intensity = G.oppositionPressure / 100;
  const metrics = [
    { key: 'approval', val: G.approval },
    { key: 'stability', val: G.stability },
    { key: 'coalition', val: G.coalition },
  ];

  // Only act if pressure is meaningful
  if (intensity < 0.3) return { action: '', effect: { approval: 0, stability: 0, coalition: 0 } };

  // Find weakest metric
  const weakest = metrics.reduce((a, b) => a.val < b.val ? a : b);

  if (weakest.key === 'approval' && weakest.val < 40) {
    return {
      action: '📢 Opozícia: „Vláda stratila dôveru ľudí — žiadame hlasovanie o nedôvere!"',
      effect: { approval: 0, stability: -3 * intensity, coalition: -2 * intensity }
    };
  }
  if (weakest.key === 'stability' && weakest.val < 40) {
    return {
      action: '📢 Opozícia: „Vláda je v chaose — žiadame predčasné voľby!"',
      effect: { approval: -2 * intensity, stability: 0, coalition: -2 * intensity }
    };
  }
  if (weakest.key === 'coalition' && weakest.val < 40) {
    // Target weakest coalition partner
    let weakPartner = '';
    let lowestSat = 100;
    era.coalitionPartners.forEach(cp => {
      const p = G.cp[cp.id];
      if (p && p.on && p.sat < lowestSat) { lowestSat = p.sat; weakPartner = cp.name; }
    });
    return {
      action: `📢 Opozícia oslovuje ${weakPartner}: „Prečo zostávate v tejto vláde?"`,
      effect: { approval: 0, stability: -1 * intensity, coalition: -3 * intensity }
    };
  }
  if (G.econ.unemp > 12) {
    return {
      action: '📢 Opozícia: „Nezamestnanosť na rekorde — vláda zlyháva v ekonomike!"',
      effect: { approval: -3 * intensity, stability: 0, coalition: 0 }
    };
  }
  if (G.econ.infl > 8) {
    return {
      action: '📢 Opozícia: „Inflácia ničí rodinné rozpočty — vláda musí konať!"',
      effect: { approval: -2 * intensity, stability: -1 * intensity, coalition: 0 }
    };
  }

  return { action: '', effect: { approval: 0, stability: 0, coalition: 0 } };
}

// ═══════════════════════════════════════════════════════════
//  8. BUSINESS CYCLE (sine wave + random shocks)
// ═══════════════════════════════════════════════════════════
export function businessCycleTick(G: GameState): void {
  // Advance cycle position (period ~36 months)
  G.businessCycle += (2 * Math.PI) / 36 + gaussRand() * 0.05;
  if (G.businessCycle > 2 * Math.PI) G.businessCycle -= 2 * Math.PI;

  const wave = Math.sin(G.businessCycle);

  // Business cycle affects GDP growth and unemployment
  G.econ.gdpGrowth += wave * 0.15;
  G.econ.unemp += wave * -0.08;

  // Random economic shocks (2% chance per month of significant shock)
  if (Math.random() < 0.02) {
    const shock = gaussRand() * 1.5;
    G.econ.gdpGrowth += shock;
    G.econ.infl += Math.abs(shock) * 0.3;
    G.stability -= Math.abs(shock) * 2;
  }

  // Mean reversion — extreme values pull back toward normal
  G.econ.gdpGrowth += (2.0 - G.econ.gdpGrowth) * 0.03; // pull toward 2%
  G.econ.unemp += (6.0 - G.econ.unemp) * 0.02;          // pull toward 6%
  G.econ.infl += (2.5 - G.econ.infl) * 0.02;             // pull toward 2.5%
}

// ═══════════════════════════════════════════════════════════
//  9. DEFICIT DYNAMICS — fiscal policy has real consequences
// ═══════════════════════════════════════════════════════════
export function deficitDynamics(G: GameState): void {
  // Social spending (pensions, healthcare) automatically increases deficit
  const socialPressure = Math.max(0, G.stances.social || 0) * 0.2;
  G.econ.deficit += socialPressure * 0.1;

  // Tax policy affects deficit — economic growth generates revenue
  if (G.econ.gdpGrowth > 2) {
    G.econ.deficit -= (G.econ.gdpGrowth - 2) * 0.15; // growth reduces deficit
  } else if (G.econ.gdpGrowth < 0) {
    G.econ.deficit += Math.abs(G.econ.gdpGrowth) * 0.3; // recession worsens deficit
  }

  // Deficit mean reversion (fiscal gravity)
  G.econ.deficit += ((-3.0) - G.econ.deficit) * 0.02;

  // Clamp deficit
  G.econ.deficit = Math.max(-15, Math.min(5, G.econ.deficit));
}

// ═══════════════════════════════════════════════════════════
//  DEBT-TO-GDP RATIO & INTEREST RATE DYNAMICS
// ═══════════════════════════════════════════════════════════
export function fiscalHealth(G: GameState): void {
  // Update debt-to-GDP ratio
  if (G.econ.gdp > 0) {
    G.debtToGdp = (G.econ.debt / G.econ.gdp) * 100;
  }

  // Endogenous interest rate — markets price risk
  const euAccess = (G.diplo.eu ?? 50) / 100;
  const baseRate = 2.0 - euAccess * 1.0; // 1.0% (good EU) to 2.0% (bad EU)
  const riskPremium = G.debtToGdp > 60 ? (G.debtToGdp - 60) * 0.08 : 0;
  const deficitPremium = G.econ.deficit > 3 ? (G.econ.deficit - 3) * 0.15 : 0;

  const targetRate = Math.max(0.5, Math.min(12, baseRate + riskPremium + deficitPremium));
  G.interestRate += (targetRate - G.interestRate) * 0.15;

  // Interest payments eat into deficit
  const interestCost = G.econ.debt * (G.interestRate / 100) / 12;
  G.econ.deficit += interestCost * 0.1;

  // Debt spiral: interest > growth + 2pp AND high debt = unsustainable
  if (G.interestRate > G.econ.gdpGrowth + 2 && G.debtToGdp > 80) {
    G.stability -= 0.5;
    G.approval -= 0.3;
  }
}

// ═══════════════════════════════════════════════════════════
//  FOREIGN DIRECT INVESTMENT — capital flows
// ═══════════════════════════════════════════════════════════
export function fdiDynamics(G: GameState): void {
  const stabilityFactor = G.stability / 100;
  const euFactor = (G.diplo.eu ?? 50) / 100;
  const taxFactor = Math.max(0, 1 - (G.stances.ekonomika ?? 0) * 0.08);
  const ruleFactor = (G.social.corrupt ?? 50) < 30 ? 0.7 : 1.0;
  const wageFactor = G.econ.minW < 700 ? 1.1 : G.econ.minW > 1000 ? 0.8 : 1.0;

  const targetFdi = 10 * stabilityFactor * euFactor * taxFactor * ruleFactor * wageFactor;
  G.fdi += (targetFdi - G.fdi) * 0.08;
  G.fdi = clamp(G.fdi, 0, 10);

  // FDI effects on economy
  G.econ.gdpGrowth += G.fdi * 0.03;
  G.econ.unemp -= G.fdi * 0.015;
  G.econ.unemp = Math.max(2, G.econ.unemp);

  // FDI shock — sudden withdrawal if conditions deteriorate
  if (G.fdi < 2 && stabilityFactor < 0.3) {
    G.econ.unemp += 0.3;
    G.econ.gdpGrowth -= 0.2;
  }
}

// ═══════════════════════════════════════════════════════════
//  OKUN'S LAW — GDP-unemployment relationship
// ═══════════════════════════════════════════════════════════
export function okunsLaw(G: GameState): void {
  const potentialGrowth = 2.5;
  const gap = G.econ.gdpGrowth - potentialGrowth;

  if (gap < 0) {
    G.econ.unemp -= gap * 0.3; // negative gap → positive unemployment change
  } else {
    G.econ.unemp -= gap * 0.2;
  }
  G.econ.unemp = clamp(G.econ.unemp, 2, 30);

  // NAIRU ~6% for Slovakia
  const nairu = 6.0;
  if (G.econ.unemp < nairu) {
    const gapBelowNairu = nairu - G.econ.unemp;
    G.econ.infl += gapBelowNairu * 0.12;
  } else if (G.econ.unemp > nairu + 4) {
    G.econ.infl -= (G.econ.unemp - nairu - 4) * 0.05;
  }
  G.econ.infl = clamp(G.econ.infl, 0, 25);
}

// ═══════════════════════════════════════════════════════════
//  LABOR MARKET — participation and brain drain
// ═══════════════════════════════════════════════════════════
export function laborMarketTick(G: GameState): void {
  const wagePull = G.econ.minW < 600 ? -0.1 : G.econ.minW > 900 ? 0.05 : 0;
  const discouragement = G.econ.unemp > 10 ? -(G.econ.unemp - 10) * 0.02 : 0;
  const euEffect = (G.diplo.eu ?? 50) > 70 ? -0.02 : 0;
  const growthPull = G.econ.gdpGrowth > 3 ? 0.05 : 0;

  G.laborParticipation += wagePull + discouragement + euEffect + growthPull;
  G.laborParticipation += (65 - G.laborParticipation) * 0.02;
  G.laborParticipation = clamp(G.laborParticipation, 50, 78);

  if (G.laborParticipation < 60) {
    G.econ.infl += (60 - G.laborParticipation) * 0.02;
    G.econ.gdpGrowth -= (60 - G.laborParticipation) * 0.01;
  }
  if (G.laborParticipation > 70) {
    G.econ.unemp = Math.max(2, G.econ.unemp - 0.05);
  }
}

// ═══════════════════════════════════════════════════════════
//  10. EU FUNDS LINK — diplomacy affects real money
// ═══════════════════════════════════════════════════════════
export function euFundsLink(G: GameState): void {
  const euRelation = G.diplo.eu ?? 50;

  // EU funds scale with relations (0-100 → 0-10 billion flow)
  const targetFlow = (euRelation / 100) * 10;
  G.euFundsFlow += (targetFlow - G.euFundsFlow) * 0.1; // gradual adjustment

  // EU funds reduce deficit and boost GDP
  G.econ.deficit -= G.euFundsFlow * 0.05;
  G.econ.gdpGrowth += G.euFundsFlow * 0.02;

  // Low EU funds notification threshold
  if (G.euFundsFlow < 2 && euRelation < 30) {
    G.econ.deficit += 0.3; // loss of EU funds hurts budget
  }
}

// ═══════════════════════════════════════════════════════════
//  11. SMART MINIMUM WAGE — linked to inflation and policy
// ═══════════════════════════════════════════════════════════
export function smartMinWage(G: GameState): void {
  // Annual review (every 12 months)
  if (G.month > 0 && G.month % 12 === 0) {
    // Base increase tracks inflation
    const inflAdjust = G.econ.minW * (G.econ.infl / 100);
    // Social stance pushes higher increases
    const socialBonus = Math.max(0, G.stances.social || 0) * G.econ.minW * 0.005;
    // GDP growth enables higher increases
    const growthBonus = Math.max(0, G.econ.gdpGrowth) * G.econ.minW * 0.003;

    const increase = Math.round(inflAdjust + socialBonus + growthBonus);
    G.econ.minW += Math.max(10, increase); // at least 10 per year

    // Higher min wage increases persona scores for workers but hurts business
    Object.keys(G.pScores).forEach(id => {
      G.pScores[id] = clamp(G.pScores[id] + (increase > 30 ? 1 : -0.5), 5, 95);
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  12. ECONOMIC CRISIS TRIGGERS
// ═══════════════════════════════════════════════════════════
export function econCrisisCheck(G: GameState): string | null {
  // Check for crisis conditions — return warning message or null
  if (G.debtToGdp > 80 && G.econ.deficit > 4) {
    G.econ.gdpGrowth -= 1;
    G.stability = Math.max(0, G.stability - 5);
    return '💥 Dlhová kríza! Rating agentúry znížili hodnotenie. Úroky na dlhopisoch stúpajú.';
  }
  if (G.econ.infl > 15) {
    G.approval -= 3;
    G.econ.unemp += 0.5;
    return '💥 Hyperinflácia! Ceny rastú nekontrolovateľne. Ľudia panicky nakupujú.';
  }
  if (G.econ.unemp > 20) {
    G.approval -= 5;
    G.stability -= 3;
    return '💥 Masová nezamestnanosť! Sociálne nepokoje v priemyselných regiónoch.';
  }
  if (G.econ.gdpGrowth < -3) {
    G.stability -= 4;
    G.econ.unemp += 0.8;
    return '💥 Recesia! HDP prudko klesá. Firmy zatvárajú, ľudia strácajú prácu.';
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
//  13. INCUMBENCY PENALTY — popularity naturally erodes
// ═══════════════════════════════════════════════════════════
export function incumbencyPenalty(G: GameState): void {
  // Small natural approval decay each month (voters get bored/frustrated)
  const decay = 0.15 + (G.month * 0.005); // grows over time — longer in office, harder to stay popular
  G.approval = Math.max(0, G.approval - decay);

  // Stability also erodes slightly — governing is hard
  G.stability = Math.max(0, G.stability - 0.08);
}

// ═══════════════════════════════════════════════════════════
//  14. CRISIS FATIGUE — constant crises numb the public
// ═══════════════════════════════════════════════════════════
export function crisisFatigueTick(G: GameState, eventTier: string): number {
  // Crises increase fatigue, quiet months decrease it
  if (eventTier === 'crisis') {
    G.crisisFatigue = Math.min(1, G.crisisFatigue + 0.12);
  } else if (eventTier === 'open') {
    G.crisisFatigue = Math.max(0, G.crisisFatigue - 0.06);
  } else {
    G.crisisFatigue = Math.max(0, G.crisisFatigue - 0.03);
  }

  // Return effectiveness multiplier — high fatigue = smaller approval swings
  // (public is numb, both good and bad news has less impact)
  return 1 - G.crisisFatigue * 0.4; // 1.0 to 0.6
}

// ═══════════════════════════════════════════════════════════
//  15. POLITICAL CAPITAL — limited resource for big moves
// ═══════════════════════════════════════════════════════════
export function politicalCapitalTick(G: GameState, policyLength: number): number {
  // Longer/more ambitious policies cost more capital
  const cost = Math.min(20, policyLength / 50);
  G.politicalCapital = Math.max(0, G.politicalCapital - cost);

  // Recharge slowly each month
  G.politicalCapital = Math.min(100, G.politicalCapital + 3);

  // High approval recharges faster
  if (G.approval > 60) G.politicalCapital = Math.min(100, G.politicalCapital + 2);

  // Return implementation multiplier — low capital = policies less effective
  if (G.politicalCapital < 20) return 0.6;
  if (G.politicalCapital < 40) return 0.8;
  return 1.0;
}

// ═══════════════════════════════════════════════════════════
//  BRAIN DRAIN — emigration pressure from poor conditions
// ═══════════════════════════════════════════════════════════
export function brainDrainTick(G: GameState): void {
  // Low wages + high unemployment + low EU relations = emigration
  const wagePressure = G.econ.minW < 700 ? (700 - G.econ.minW) * 0.01 : 0;
  const unempPressure = G.econ.unemp > 10 ? (G.econ.unemp - 10) * 0.1 : 0;
  const euPull = G.diplo.eu !== undefined ? Math.max(0, (G.diplo.eu - 50) * 0.02) : 0;

  G.brainDrain = Math.min(50, Math.max(0, G.brainDrain + wagePressure + unempPressure + euPull - 0.1));

  // Brain drain reduces GDP growth potential
  if (G.brainDrain > 15) {
    G.econ.gdpGrowth -= (G.brainDrain - 15) * 0.02;
  }
  // Very high brain drain hits labor participation
  if (G.brainDrain > 30) {
    G.laborParticipation = Math.max(55, G.laborParticipation - 0.1);
  }
}

// ═══════════════════════════════════════════════════════════
//  OLIGARCHIC NETWORK — hidden corruption exposure
// ═══════════════════════════════════════════════════════════
export function oligarchicTick(G: GameState): void {
  // Privatization, deregulation, and pro-business policies increase ties
  // Transparency and anti-corruption decrease them
  // High ties = periodic scandal risk
  if (G.oligarchicTies > 30 && Math.random() < G.oligarchicTies * 0.003) {
    // Scandal hits
    G.approval = Math.max(0, G.approval - 3);
    G.stability = Math.max(0, G.stability - 2);
    if (G.social.corrupt !== undefined) G.social.corrupt = Math.min(100, G.social.corrupt + 5);
  }
  // Natural decay
  G.oligarchicTies = Math.max(0, G.oligarchicTies - 0.2);
}

// ═══════════════════════════════════════════════════════════
//  16. DIPLOMATIC FEEDBACK — low EU means real consequences
// ═══════════════════════════════════════════════════════════
export function diploFeedback(G: GameState): void {
  // NATO relations affect stability (security guarantee)
  const nato = G.diplo.nato_r ?? 50;
  if (nato < 30) G.stability -= 0.3;

  // Russia relations: high = cheap energy but EU penalty already handled
  // Low Russia: slight energy cost
  const russia = G.diplo.russia ?? 50;
  if (russia < 20) G.econ.infl += 0.05; // energy price pressure

  // Good Czech relations boost trade
  const czech = G.diplo.czech ?? 50;
  if (czech > 70) G.econ.gdpGrowth += 0.01;
}

// ═══════════════════════════════════════════════════════════
//  MEDIA ECOSYSTEM TICK
// ═══════════════════════════════════════════════════════════
export function mediaEcosystemTick(G: GameState): void {
  // Dezinfo grows when press freedom is low and trust is low
  if (G.social.press !== undefined && G.social.press < 40) {
    G.social.dezinfo = Math.min(80, (G.social.dezinfo || 20) + 0.3);
  }
  // High dezinfo erodes trust
  if ((G.social.dezinfo || 0) > 40) {
    G.social.mediaTrust = Math.max(10, (G.social.mediaTrust || 50) - 0.2);
  }
  // Low media trust makes approval more volatile
  if ((G.social.mediaTrust || 50) < 30) {
    G.crisisFatigue = Math.min(1, G.crisisFatigue + 0.01);
  }
  // Strong civil society pushes back against corruption
  if ((G.social.civilSociety || 50) > 60 && (G.social.corrupt || 50) > 50) {
    G.social.corrupt = Math.max(0, G.social.corrupt - 0.3);
    G.approval = Math.max(0, G.approval - 0.5); // protests reduce approval
  }
}
