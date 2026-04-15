import type { EraConfig, GameState } from './types';

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

export function applyMomentum(G: GameState, rawDelta: number): number {
  if (rawDelta !== 0) {
    G.momentum = clamp(G.momentum * MOMENTUM_DECAY + Math.sign(rawDelta) * MOMENTUM_GAIN, -1, 1);
  } else {
    G.momentum *= MOMENTUM_DECAY;
  }

  // Same-direction delta is amplified, opposite-direction is partially dampened.
  const amp = (Math.sign(rawDelta) === Math.sign(G.momentum))
    ? 1 + Math.abs(G.momentum) * MOMENTUM_AMP
    : 1 - Math.abs(G.momentum) * 0.2;

  // Volatility amplifier kicks in when persona scores are polarized (high stddev).
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

export function nashBargaining(G: GameState, era: EraConfig): void {
  const totalSeats = era.coalitionPartners.reduce((s, cp) => s + (G.cp[cp.id]?.on ? cp.seats : 0), 0);
  const surplus = totalSeats - 76; // seats above majority threshold

  era.coalitionPartners.forEach(cp => {
    const p = G.cp[cp.id];
    if (!p || !p.on) return;

    // Leverage uses Shapley power if available, else seat-share over surplus.
    const shapley = G.shapleyPower[cp.id] ?? 0;
    const leverage = shapley > 0 ? shapley * 4 : (surplus > 0 ? Math.min(3, cp.seats / Math.max(1, surplus)) : 0.5);

    // Powerful partners bleed patience faster when unhappy; bad polls compound the effect.
    const pollPenalty = G.pollApproval < 30 ? (30 - G.pollApproval) * 0.05 : 0;
    if (p.sat < 50) {
      p.pat -= (50 - p.sat) * (0.1 + leverage * 0.08) + pollPenalty;
    }

    // Higher leverage also lets a partner demand more often.
    const effectiveFreq = Math.max(2, cp.freq - Math.floor(leverage));
    if (!p.dem && (G.month - p.lastD) >= effectiveFreq) {
      const ds = era.demands.filter(d => d.partner === cp.id);
      if (ds.length) {
        p.dem = ds[Math.floor(Math.random() * ds.length)].text;
        p.lastD = G.month;
      }
    }

    const threatThreshold = 10 + leverage * 12;
    if (p.pat <= threatThreshold && cp.id !== era.coalitionPartners[0]?.id) {
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

// Shapley–Shubik power index. Enumerates n! permutations, fine because
// coalitions in this game have at most ~6 partners.
export function computeShapley(G: GameState, era: EraConfig): void {
  const active = era.coalitionPartners.filter(cp => G.cp[cp.id]?.on);
  const n = active.length;
  if (n === 0) return;

  const quota = 76; // parliamentary majority
  const power: Record<string, number> = {};
  active.forEach(cp => { power[cp.id] = 0; });

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

// Personas pull each other toward a shared mean, where "neighbors" share a
// region or political lean. Strongly negative neighbors exert extra drag.
export function socialInfluence(G: GameState, era: EraConfig): void {
  const newScores: Record<string, number> = {};

  era.personas.forEach(p => {
    const current = G.pScores[p.id] || 50;
    let neighborSum = 0, neighborCount = 0;

    era.personas.forEach(other => {
      if (other.id === p.id) return;
      if (other.region === p.region || other.lean === p.lean) {
        const s = G.pScores[other.id] || 50;
        neighborSum += s;
        neighborCount++;
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

  Object.entries(newScores).forEach(([id, v]) => {
    G.pScores[id] = clamp(v, 5, 95);
  });
}

export function econFeedback(G: GameState): void {
  if (G.econ.unemp > UNEMP_DRAG_THRESHOLD) {
    G.approval -= (G.econ.unemp - UNEMP_DRAG_THRESHOLD) * 0.3;
  }

  if (G.econ.infl > INFL_DRAG_THRESHOLD) {
    const penalty = (G.econ.infl - INFL_DRAG_THRESHOLD) * 0.3;
    Object.keys(G.pScores).forEach(id => {
      G.pScores[id] = Math.max(5, G.pScores[id] - penalty);
    });
  }

  if (G.econ.gdpGrowth > 2) {
    G.approval += (G.econ.gdpGrowth - 2) * 0.4;
  }

  if (G.debtToGdp > 60) {
    const severity = (G.debtToGdp - 60) * 0.06;
    G.stability -= severity;
    if (G.debtToGdp > 90) G.approval -= 0.5;
  }

  G.approval = clamp(G.approval);
  G.stability = clamp(G.stability);
}

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

  // Track a rolling window of the last 20 themes.
  G.policyThemes.push(...detectedThemes);
  if (G.policyThemes.length > 20) G.policyThemes = G.policyThemes.slice(-20);

  // Award the consistency bonus once a theme has shown up at least 5 times.
  let bonus = 0;
  if (G.policyThemes.length >= 5) {
    const freq: Record<string, number> = {};
    G.policyThemes.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
    const maxFreq = Math.max(...Object.values(freq));
    if (maxFreq >= 5) bonus = CONSISTENCY_BONUS;
  }

  // Flip-flop detection: each theme has a [right-pushing, left-pushing] keyword
  // list. Pushing against an already-strong stance triggers the penalty.
  const stancePushDir: Record<string, string[][]> = {
    eu: [['eu', 'nato', 'brusel', 'európ'], ['sovereign', 'suverenita', 'suverén']],
    rusko: [['russia', 'rusko', 'moskva', 'mier'], ['prozápadn', 'ukrajin']],
    ekonomika: [['invest', 'startup', 'biznis', 'podnik'], ['tax', 'dan', 'daň', 'konsolidáci']],
    social: [['social', 'pension', 'dochodok', 'dôchod'], ['liberaliz', 'škrt', 'úspor']],
    media: [['transparentn', 'slobod'], ['kontrolova', 'rtvs', 'stvr']],
    justicia: [['reform', 'právny štát', 'justíci'], ['kontrolova súd', 'ovládnuť']],
  };
  let flipPenalty = 0;
  detectedThemes.forEach(theme => {
    const stance = G.stances[theme];
    if (stance !== undefined && Math.abs(stance) >= 2) {
      const dirs = stancePushDir[theme];
      if (dirs) {
        const pushesRight = dirs[0].some(k => low.includes(k));
        const pushesLeft = dirs[1]?.some(k => low.includes(k)) ?? false;
        if (pushesRight && !pushesLeft && stance < -2) flipPenalty += FLIP_FLOP_PENALTY;
        else if (pushesLeft && !pushesRight && stance > 2) flipPenalty += FLIP_FLOP_PENALTY;
      }
    }
  });

  return { bonus, flipPenalty: Math.max(flipPenalty, -8) };
}

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
  // Coalition parties scale with approval, opposition scales inversely.
  const baseShares: Record<string, number> = {};
  const coalitionIds = new Set(era.coalitionPartners.map(cp => cp.id));
  const partyApproval = G.approval / 100;

  Object.entries(G.parl).forEach(([party, origSeats]) => {
    if (origSeats <= 0) return;
    const isCoalition = coalitionIds.has(party);
    const base = (origSeats / 150) * 100;
    if (isCoalition) {
      baseShares[party] = base * (0.6 + partyApproval * 0.8);
    } else {
      baseShares[party] = base * (0.6 + (1 - partyApproval) * 0.8);
    }
  });

  const allRuns: Record<string, number[]> = {};
  Object.keys(baseShares).forEach(p => { allRuns[p] = []; });
  let coalitionWins = 0;

  // Uncertainty scales inversely with stability — chaotic governments have
  // wider election ranges.
  const uncertainty = 3 + (100 - G.stability) * 0.04;

  for (let run = 0; run < ELECTION_RUNS; run++) {
    const votes: Record<string, number> = {};
    Object.entries(baseShares).forEach(([party, base]) => {
      const noisy = Math.max(0, base + gaussRand() * uncertainty);
      if (noisy >= 5) votes[party] = noisy; // 5% parliamentary threshold
    });

    const seats = dhondt(votes, 150);
    Object.entries(seats).forEach(([party, s]) => {
      allRuns[party].push(s);
    });

    let coalSeats = 0;
    coalitionIds.forEach(id => { coalSeats += seats[id] || 0; });
    if (coalSeats >= 76) coalitionWins++;
  }

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

// Tracks which story is dominating the news. A sufficiently intense event
// displaces whatever was running; otherwise the current story decays. The
// returned multiplier amplifies approval swings when the cycle is hot and
// dampens them when the public is distracted. Range: 0.6 to 1.2.
export function mediaCycleTick(G: GameState, eventTier: string, eventHeadline: string): number {
  const tierIntensity: Record<string, number> = {
    crisis: 0.9,
    consequence: 0.7,
    situation: 0.5,
    open: 0.2,
    quiet: 0.0,
  };
  const newIntensity = tierIntensity[eventTier] ?? 0.3;

  if (newIntensity > G.mediaCycle * 0.6) {
    G.mediaCycle = Math.min(1, G.mediaCycle * 0.3 + newIntensity);
    G.mediaCycleEvent = eventHeadline;
  } else {
    G.mediaCycle *= 0.7;
  }

  return 0.6 + G.mediaCycle * 0.6;
}

// pollApproval = actual approval + slow-drifting methodological bias
// (pollError) + per-tick sampling noise. Stable countries gradually correct
// their polling bias toward zero.
export function updatePolling(G: GameState): void {
  G.pollError += gaussRand() * 0.3;
  G.pollError = clamp(G.pollError, -5, 5);

  const noise = gaussRand() * 2;
  G.pollApproval = clamp(G.approval + G.pollError + noise);

  if (G.stability > 70) {
    G.pollError *= 0.9;
  }
}

export function oppositionMove(G: GameState, era: EraConfig): { action: string; effect: { approval: number; stability: number; coalition: number } } {
  // Pressure accumulates when the government is weak and decays otherwise.
  const avg = (G.approval + G.stability + G.coalition) / 3;
  if (avg < 40) G.oppositionPressure = Math.min(100, G.oppositionPressure + OPPOSITION_GROWTH);
  else G.oppositionPressure *= OPPOSITION_DECAY;

  const intensity = G.oppositionPressure / 100;
  const metrics = [
    { key: 'approval', val: G.approval },
    { key: 'stability', val: G.stability },
    { key: 'coalition', val: G.coalition },
  ];

  if (intensity < 0.3) return { action: '', effect: { approval: 0, stability: 0, coalition: 0 } };

  // Opposition targets whichever government metric is lowest.
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

// Sine-wave business cycle (~36 month period) plus occasional shocks and
// mean reversion toward long-run Slovak averages / ECB inflation target.
export function businessCycleTick(G: GameState): void {
  G.businessCycle += (2 * Math.PI) / 36 + gaussRand() * 0.05;
  if (G.businessCycle > 2 * Math.PI) G.businessCycle -= 2 * Math.PI;

  const wave = Math.sin(G.businessCycle);
  G.econ.gdpGrowth += wave * 0.15;
  G.econ.unemp += wave * -0.08;

  if (Math.random() < 0.02) {
    const shock = gaussRand() * 1.5;
    G.econ.gdpGrowth += shock;
    G.econ.infl += Math.abs(shock) * 0.3;
    G.stability -= Math.abs(shock) * 2;
  }

  G.econ.gdpGrowth += (2.0 - G.econ.gdpGrowth) * 0.03;
  G.econ.unemp += (6.0 - G.econ.unemp) * 0.02;
  G.econ.infl += (2.5 - G.econ.infl) * 0.04;
}

export function deficitDynamics(G: GameState): void {
  // Social-spending stance pushes the deficit up; growth pulls it down and
  // recessions blow it out. Slow reversion toward a baseline -3% deficit.
  const socialPressure = Math.max(0, G.stances.social || 0) * 0.2;
  G.econ.deficit += socialPressure * 0.1;

  if (G.econ.gdpGrowth > 2) {
    G.econ.deficit -= (G.econ.gdpGrowth - 2) * 0.15;
  } else if (G.econ.gdpGrowth < 0) {
    G.econ.deficit += Math.abs(G.econ.gdpGrowth) * 0.3;
  }

  G.econ.deficit += ((-3.0) - G.econ.deficit) * 0.02;
  G.econ.deficit = Math.max(-15, Math.min(5, G.econ.deficit));
}

export function fiscalHealth(G: GameState): void {
  if (G.econ.gdp > 0) {
    G.debtToGdp = (G.econ.debt / G.econ.gdp) * 100;
  }

  // Markets price risk: base rate depends on EU access, with premia added
  // for high debt/GDP and sustained large deficits.
  const euAccess = (G.diplo.eu ?? 50) / 100;
  const baseRate = 2.0 - euAccess * 1.0;
  const riskPremium = G.debtToGdp > 60 ? (G.debtToGdp - 60) * 0.08 : 0;
  const deficitPremium = G.econ.deficit > 3 ? (G.econ.deficit - 3) * 0.15 : 0;

  const targetRate = Math.max(0.5, Math.min(12, baseRate + riskPremium + deficitPremium));
  G.interestRate += (targetRate - G.interestRate) * 0.15;

  const interestCost = G.econ.debt * (G.interestRate / 100) / 12;
  G.econ.deficit += interestCost * 0.1;

  // Classic debt spiral: rates exceed growth by 2pp while debt is already high.
  if (G.interestRate > G.econ.gdpGrowth + 2 && G.debtToGdp > 80) {
    G.stability -= 0.5;
    G.approval -= 0.3;
  }
}

export function fdiDynamics(G: GameState): void {
  const stabilityFactor = G.stability / 100;
  const euFactor = (G.diplo.eu ?? 50) / 100;
  const taxFactor = Math.max(0, 1 - (G.stances.ekonomika ?? 0) * 0.08);
  const ruleFactor = (G.social.corrupt ?? 50) > 60 ? 0.7 : (G.social.corrupt ?? 50) < 30 ? 1.2 : 1.0;
  const wageFactor = G.econ.minW < 700 ? 1.1 : G.econ.minW > 1000 ? 0.8 : 1.0;

  const targetFdi = 10 * stabilityFactor * euFactor * taxFactor * ruleFactor * wageFactor;
  G.fdi += (targetFdi - G.fdi) * 0.08;
  G.fdi = clamp(G.fdi, 0, 10);

  G.econ.gdpGrowth += G.fdi * 0.03;
  G.econ.unemp -= G.fdi * 0.015;
  G.econ.unemp = Math.max(2, G.econ.unemp);

  // Capital-flight shock when FDI collapses in an already-unstable country.
  if (G.fdi < 2 && stabilityFactor < 0.3) {
    G.econ.unemp += 0.3;
    G.econ.gdpGrowth -= 0.2;
  }
}

// Okun's law plus Phillips-curve wage pressure around a ~6% NAIRU, with a
// reactive central bank: high inflation raises rates which raises
// unemployment. The central bank is the ECB for eurozone eras, NBS otherwise.
export function okunsLaw(G: GameState): void {
  const potentialGrowth = 2.5;
  const gap = G.econ.gdpGrowth - potentialGrowth;

  if (gap < 0) {
    G.econ.unemp -= gap * 0.3;
  } else {
    G.econ.unemp -= gap * 0.2;
  }
  G.econ.unemp = clamp(G.econ.unemp, 2, 30);

  const nairu = 6.0;
  if (G.econ.unemp < nairu) {
    G.econ.infl += (nairu - G.econ.unemp) * 0.08;
  } else if (G.econ.unemp > nairu + 2) {
    G.econ.infl -= (G.econ.unemp - nairu - 2) * 0.06;
  }

  if (G.econ.infl > 4) {
    G.econ.unemp += (G.econ.infl - 4) * 0.04;
  }

  G.econ.infl = clamp(G.econ.infl, 0, 25);
}

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

// EU fund flow scales with diplo.eu (0-100 → 0-10 bn), adjusts gradually,
// and feeds back into deficit and growth. Hostile relations trigger a
// budget shortfall from cancelled programs.
export function euFundsLink(G: GameState): void {
  const euRelation = G.diplo.eu ?? 50;

  const targetFlow = (euRelation / 100) * 10;
  G.euFundsFlow += (targetFlow - G.euFundsFlow) * 0.1;

  G.econ.deficit -= G.euFundsFlow * 0.05;
  G.econ.gdpGrowth += G.euFundsFlow * 0.02;

  if (G.euFundsFlow < 2 && euRelation < 30) {
    G.econ.deficit += 0.3;
  }
}

// Annual minimum wage review: inflation is the floor, a social stance
// and real GDP growth add to it, minimum 10 EUR/yr.
export function smartMinWage(G: GameState): void {
  if (G.month > 0 && G.month % 12 === 0) {
    const inflAdjust = G.econ.minW * (G.econ.infl / 100);
    const socialBonus = Math.max(0, G.stances.social || 0) * G.econ.minW * 0.005;
    const growthBonus = Math.max(0, G.econ.gdpGrowth) * G.econ.minW * 0.003;

    const increase = Math.round(inflAdjust + socialBonus + growthBonus);
    G.econ.minW += Math.max(10, increase);

    Object.keys(G.pScores).forEach(id => {
      G.pScores[id] = clamp(G.pScores[id] + (increase > 30 ? 1 : -0.5), 5, 95);
    });
  }
}

export function econCrisisCheck(G: GameState): string | null {
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

// Small monthly approval decay that grows with tenure but is capped at 0.30
// per month; stability erodes a bit too.
export function incumbencyPenalty(G: GameState): void {
  const decay = 0.15 + Math.min(G.month * 0.004, 0.15);
  G.approval = Math.max(0, G.approval - decay);
  G.stability = Math.max(0, G.stability - 0.08);
}

// Constant crises desensitize the public. Returned multiplier dampens
// approval swings in both directions as fatigue rises. Range: 1.0 to 0.6.
export function crisisFatigueTick(G: GameState, eventTier: string): number {
  if (eventTier === 'crisis') {
    G.crisisFatigue = Math.min(1, G.crisisFatigue + 0.12);
  } else if (eventTier === 'open') {
    G.crisisFatigue = Math.max(0, G.crisisFatigue - 0.06);
  } else {
    G.crisisFatigue = Math.max(0, G.crisisFatigue - 0.03);
  }

  return 1 - G.crisisFatigue * 0.4;
}

// Policy length proxies ambition and costs capital; high approval speeds
// recharge. Returned multiplier weakens low-capital policy impact.
export function politicalCapitalTick(G: GameState, policyLength: number): number {
  const cost = Math.min(20, policyLength / 50);
  G.politicalCapital = Math.max(0, G.politicalCapital - cost);
  G.politicalCapital = Math.min(100, G.politicalCapital + 3);
  if (G.approval > 60) G.politicalCapital = Math.min(100, G.politicalCapital + 2);

  if (G.politicalCapital < 20) return 0.6;
  if (G.politicalCapital < 40) return 0.8;
  return 1.0;
}

export function brainDrainTick(G: GameState): void {
  const wagePressure = G.econ.minW < 700 ? (700 - G.econ.minW) * 0.01 : 0;
  const unempPressure = G.econ.unemp > 10 ? (G.econ.unemp - 10) * 0.1 : 0;
  // Good EU relations cut both ways: free movement makes leaving easier, but
  // also signal a healthier economy that retains talent. Only a net
  // brain-drain driver when wages/jobs are already bad.
  const euPull = G.diplo.eu !== undefined && G.diplo.eu > 60
    ? (wagePressure + unempPressure > 0.3 ? (G.diplo.eu - 60) * 0.01 : -(G.diplo.eu - 60) * 0.005)
    : 0;

  G.brainDrain = Math.min(50, Math.max(0, G.brainDrain + wagePressure + unempPressure + euPull - 0.1));

  if (G.brainDrain > 15) {
    G.econ.gdpGrowth -= (G.brainDrain - 15) * 0.02;
  }
  if (G.brainDrain > 30) {
    G.laborParticipation = Math.max(55, G.laborParticipation - 0.1);
  }
}

// oligarchicTies is built up elsewhere by pro-business/privatization policy
// and decayed by transparency moves. Above 30 there is a rolling chance of
// a scandal firing.
export function oligarchicTick(G: GameState): void {
  if (G.oligarchicTies > 30 && Math.random() < G.oligarchicTies * 0.003) {
    G.approval = Math.max(0, G.approval - 3);
    G.stability = Math.max(0, G.stability - 2);
    if (G.social.corrupt !== undefined) G.social.corrupt = Math.min(100, G.social.corrupt + 5);
  }
  G.oligarchicTies = Math.max(0, G.oligarchicTies - 0.2);
}

export function diploFeedback(G: GameState): void {
  // NATO weakness drags stability, broken Russia ties pinch energy prices
  // (the EU penalty from *good* Russia ties is handled at the policy level),
  // strong Czech ties help trade.
  const nato = G.diplo.nato_r ?? 50;
  if (nato < 30) G.stability -= 0.3;

  const russia = G.diplo.russia ?? 50;
  if (russia < 20) G.econ.infl += 0.05;

  const czech = G.diplo.czech ?? 50;
  if (czech > 70) G.econ.gdpGrowth += 0.01;
}

// Feedback chain: restricted press → rising disinformation → declining media
// trust → higher crisis fatigue. A strong civil society pushes back on
// corruption but the protests themselves cost the government approval.
export function mediaEcosystemTick(G: GameState): void {
  if (G.social.press !== undefined && G.social.press < 40) {
    G.social.dezinfo = Math.min(80, (G.social.dezinfo || 20) + 0.3);
  }
  if ((G.social.dezinfo || 0) > 40) {
    G.social.mediaTrust = Math.max(10, (G.social.mediaTrust || 50) - 0.2);
  }
  if ((G.social.mediaTrust || 50) < 30) {
    G.crisisFatigue = Math.min(1, G.crisisFatigue + 0.01);
  }
  if ((G.social.civilSociety || 50) > 60 && (G.social.corrupt || 50) > 50) {
    G.social.corrupt = Math.max(0, G.social.corrupt - 0.3);
    G.approval = Math.max(0, G.approval - 0.5);
  }
}

export function courtTick(G: GameState, era: EraConfig): void {
  if (!G.court.judges.length) return;

  G.court.judges = G.court.judges.filter(j => {
    if (j.termEnd > 0 && G.month >= j.termEnd) {
      G.court.pendingVacancies++;
      return false;
    }
    return true;
  });

  if (G.court.pendingVacancies > 0) {
    G.court.courtPrestige = Math.max(10, G.court.courtPrestige - G.court.pendingVacancies * 0.8);
  }
  // Below 7 judges the court lacks quorum and cannot rule — this also
  // damages EU relations (rule-of-law concern).
  const quorumMet = G.court.judges.length >= 7;
  if (!quorumMet) {
    G.court.courtPrestige = Math.max(5, G.court.courtPrestige - 2);
    G.stability = Math.max(0, G.stability - 0.5);
    if (G.diplo.eu !== undefined) G.diplo.eu = Math.max(0, G.diplo.eu - 0.3);
  }

  const avgConviction = G.court.judges.reduce((s, j) => s + j.conviction, 0) / Math.max(1, G.court.judges.length);
  if (avgConviction > 6) {
    G.court.courtPrestige = Math.min(90, G.court.courtPrestige + 0.1);
  }

  // Low-conviction judges have a ~2%/month chance of resigning under pressure.
  const resignedIds: string[] = [];
  for (const j of G.court.judges) {
    if (j.conviction <= 3 && Math.random() < 0.02) {
      G.court.pendingVacancies++;
      resignedIds.push(j.id);
    }
  }
  if (resignedIds.length) {
    G.court.judges = G.court.judges.filter(j => !resignedIds.includes(j.id));
  }
}

// Higher return value = court more aligned with the PM (weaker check).
export function courtIdeologyScore(G: GameState): number {
  if (!G.court.judges.length) return 50;
  const avgIdeology = G.court.judges.reduce((s, j) => s + j.ideology, 0) / G.court.judges.length;
  const avgLoyalty = G.court.judges.reduce((s, j) => s + j.loyalty, 0) / G.court.judges.length;
  return clamp((avgLoyalty / 10) * 60 + (1 - G.court.courtPrestige / 100) * 40, 0, 100);
}

export function cabinetTick(G: GameState, era: EraConfig): { scandal: string | null } {
  if (!G.cabinet.ministers.length) return { scandal: null };

  let scandal: string | null = null;

  // At most one scandal per month. Higher-profile ministers do more damage.
  for (const m of G.cabinet.ministers) {
    if (Math.random() < m.corruption / 150) {
      const damage = m.publicProfile * 1.5;
      G.approval = Math.max(0, G.approval - damage * 0.5);
      G.stability = Math.max(0, G.stability - damage * 0.3);
      G.oligarchicTies = Math.min(100, G.oligarchicTies + damage * 0.5);
      scandal = `Škandál: ${m.name} (${era.cabinet?.ministries.find(x => x.id === m.ministry)?.name || m.ministry})`;
      break;
    }
  }

  // Cohesion blends average loyalty with a penalty for multi-party diversity.
  const avgLoyalty = G.cabinet.ministers.reduce((s, m) => s + m.loyalty, 0) / G.cabinet.ministers.length;
  const parties = new Set(G.cabinet.ministers.map(m => m.party));
  const partyPenalty = (parties.size - 1) * 3;
  const targetCohesion = clamp(avgLoyalty * 10 - partyPenalty + 10, 20, 95);
  G.cabinet.cabinetCohesion += (targetCohesion - G.cabinet.cabinetCohesion) * 0.1;

  const disloyal = G.cabinet.ministers.filter(m => m.loyalty <= 3);
  if (disloyal.length > 0) {
    G.impl = Math.max(30, G.impl - disloyal.length * 1.5);
  }

  const avgCompetence = G.cabinet.ministers.reduce((s, m) => s + m.competence, 0) / G.cabinet.ministers.length;
  if (avgCompetence < 5) {
    G.econ.gdpGrowth -= (5 - avgCompetence) * 0.05;
  }

  return { scandal };
}

// Returns an implementation multiplier in [0.7, 1.3] based on the average
// competence of ministers whose ministry keywords appear in the policy.
export function cabinetImplementationMod(G: GameState, policyText: string, era: EraConfig): number {
  if (!G.cabinet.ministers.length || !era.cabinet) return 1.0;
  const lower = policyText.toLowerCase();
  let relevantCompetence = 0;
  let count = 0;
  for (const minister of G.cabinet.ministers) {
    const ministry = era.cabinet.ministries.find(m => m.id === minister.ministry);
    if (!ministry) continue;
    if (ministry.domain.some(kw => lower.includes(kw))) {
      relevantCompetence += minister.competence;
      count++;
    }
  }
  if (count === 0) return 1.0;
  const avg = relevantCompetence / count;
  return 0.7 + (avg / 10) * 0.6;
}

export function institutionsTick(G: GameState, era: EraConfig): void {
  if (!G.institutions.heads.length) return;

  // Expired heads don't vacate automatically — they linger as "holdovers"
  // with weakened conviction for another year.
  G.institutions.heads.forEach(h => {
    if (h.termEnd > 0 && G.month >= h.termEnd) {
      h.conviction = Math.max(1, h.conviction - 1);
      h.termEnd = h.termEnd + 12;
    }
  });

  G.institutions.capturedCount = G.institutions.heads.filter(h => h.loyalty >= 7).length;

  const avgConviction = G.institutions.heads.reduce((s, h) => s + h.conviction, 0) / G.institutions.heads.length;
  const capturedPenalty = G.institutions.capturedCount * 8;
  G.institutions.institutionalIntegrity = clamp(avgConviction * 10 - capturedPenalty + 20, 5, 100);

  if (G.institutions.capturedCount >= 4) {
    if (G.diplo.eu !== undefined) G.diplo.eu = Math.max(0, G.diplo.eu - 0.5);
    G.stability = Math.max(0, G.stability - 0.3);
  }
  if (G.institutions.capturedCount >= 5) {
    if (G.diplo.eu !== undefined) G.diplo.eu = Math.max(0, G.diplo.eu - 1.0);
  }

  // Institution-specific effects: a loyal SIS director can suppress
  // investigations; a high-conviction independent GP fights corruption;
  // a loyal police president dampens opposition pressure; a captured RTVS
  // steers the media cycle.
  const sis = G.institutions.heads.find(h => h.institution === 'sis');
  if (sis && sis.loyalty >= 8) {
    G.oligarchicTies = Math.min(100, G.oligarchicTies + 0.3);
  }

  const gp = G.institutions.heads.find(h => h.institution === 'gp');
  if (gp && gp.loyalty <= 3 && gp.conviction >= 7) {
    G.oligarchicTies = Math.max(0, G.oligarchicTies - 0.5);
  }

  const pp = G.institutions.heads.find(h => h.institution === 'pp');
  if (pp && pp.loyalty >= 7) {
    G.oppositionPressure = Math.max(0, G.oppositionPressure - 0.5);
  }

  const rtvs = G.institutions.heads.find(h => h.institution === 'rtvs');
  if (rtvs && rtvs.loyalty >= 7) {
    G.mediaCycle = Math.max(0, G.mediaCycle - 0.05);
    if (G.social.press !== undefined) G.social.press = Math.max(0, G.social.press - 0.2);
  }
}
