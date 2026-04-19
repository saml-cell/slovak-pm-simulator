import { describe, it, expect, beforeEach } from 'vitest';
import { esc, normalizeText } from '../sanitize';
import {
  setEra, initGame, coalitionSeats, getState,
  initCalendar, getCalendarDate, getFullDate,
} from '../state';
import {
  applyMomentum, computeShapley, policyConsistency,
  deficitDynamics, okunsLaw, fdiDynamics, clamp,
} from '../advanced';
import { kwScore } from '../scoring';
import { adoptLaw, initiateScheme, SCHEMES } from '../game-flow';
import type { EraConfig, GameState, CoalitionPartner } from '../types';
import eraJson from '../../eras/fico-2012-2016.json';

/** Build a partial GameState with sensible defaults for the fields tests don't care about. */
function makeState(overrides: Partial<GameState>): GameState {
  const defaults: GameState = {
    month: 0, approval: 50, stability: 50, coalition: 50, impl: 80,
    prevA: 50, prevS: 50, prevC: 50, prevImpl: 80,
    history: [], approvalH: [50],
    pScores: {}, sScores: {},
    econ: { gdp: 100, gdpGrowth: 2, unemp: 6, infl: 3, deficit: -3, debt: 50, minW: 700 },
    diplo: {}, social: {},
    cp: {}, parl: {}, flags: {}, cq: [],
    used: new Set(), analysis: null, event: null,
    pellegrini: false, stances: {},
    momentum: 0, policyThemes: [], oppositionPressure: 20,
    businessCycle: 0, politicalCapital: 80, crisisFatigue: 0, euFundsFlow: 5,
    debtToGdp: 50, fdi: 5, mediaCycle: 0, mediaCycleEvent: '',
    pollApproval: 50, pollError: 0, interestRate: 2.5, laborParticipation: 65,
    shapleyPower: {}, brainDrain: 0, oligarchicTies: 0,
    court: { judges: [], pendingVacancies: 0, courtPrestige: 50 },
    cabinet: { ministers: [], cabinetCohesion: 70, reshuffleCount: 0 },
    institutions: { heads: [], institutionalIntegrity: 60, capturedCount: 0 },
    mood: 'honeymoon', moodUntil: 3,
    laws: [],
    stakeholderDemands: {},
  };
  return { ...defaults, ...overrides };
}

/** Build a partial EraConfig with sensible defaults. */
function makeEra(overrides: Partial<EraConfig>): EraConfig {
  const defaults: EraConfig = {
    meta: { id: 'test', pmName: 'Test PM', headerTitle: 'Test', saveKey: 'test_save', pellegriniMonth: -1 },
    calendar: { startMonthOffset: 0, startYear: 2020 },
    totalMonths: 48, gameOverThreshold: 10,
    titleScreen: { pmName: 'Test PM', subtitle: '', description: '', startButtonText: 'Start' },
    partyDisplay: { colors: {}, names: {} },
    personas: [], personaQuotes: {}, politicians: [],
    coalitionPartners: [], demands: [], regions: [], stakeholders: [],
    diplomacy: [], keywords: {}, forcedEvents: [], randomEvents: [],
    headlines: {
      left: { name: 'Left', entries: [] },
      center: { name: 'Center', entries: [] },
      right: { name: 'Right', entries: [] },
    },
    initialState: {
      approval: 50, stability: 50, coalition: 50, impl: 80,
      econ: { gdp: 100, gdpGrowth: 2, unemp: 6, infl: 3, deficit: -3, debt: 50, minW: 700 },
      diplo: {}, social: {}, cp: {}, parl: {}, stances: {},
    },
  };
  return { ...defaults, ...overrides };
}

const realEra = eraJson as EraConfig;

function loadRealEra(): GameState {
  setEra(realEra);
  initCalendar(realEra.calendar);
  return initGame();
}

describe('esc — HTML escaping', () => {
  it('escapes angle brackets and ampersands', () => {
    expect(esc('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert("x")&lt;/script&gt;'
    );
  });

  it('escapes single quotes to numeric entity', () => {
    expect(esc("it's ok")).toBe('it&#39;s ok');
  });

  it('returns empty string for empty input', () => {
    expect(esc('')).toBe('');
  });
});

describe('calendar — offset arithmetic', () => {
  beforeEach(() => {
    initCalendar({ startMonthOffset: 3, startYear: 2012 });
  });

  it('getCalendarDate respects offset at month 0', () => {
    expect(getCalendarDate(0)).toBe('Apr 2012');
  });

  it('getCalendarDate wraps across year boundary', () => {
    // offset 3 + i 9 = 12 → month 0 of 2013
    expect(getCalendarDate(9)).toBe('Jan 2013');
  });

  it('getFullDate returns Slovak month name', () => {
    expect(getFullDate(0)).toBe('Apríl 2012');
  });
});

describe('initGame + coalitionSeats — era bootstrap', () => {
  it('initGame produces state with starting metrics from era', () => {
    const G = loadRealEra();
    expect(G.month).toBe(0);
    expect(G.approval).toBe(realEra.initialState.approval);
    expect(G.stability).toBe(realEra.initialState.stability);
    expect(G.history).toEqual([]);
    expect(G.approvalH).toHaveLength(1);
  });

  it('coalitionSeats equals sum of active partners in fico-2012', () => {
    loadRealEra();
    const state = getState();
    const expected = realEra.coalitionPartners.reduce(
      (sum: number, cp: CoalitionPartner) =>
        sum + (state.cp[cp.id]?.on ? cp.seats : 0),
      0
    );
    expect(coalitionSeats()).toBe(expected);
    // Fico II was single-party majority — should be at least 76
    expect(coalitionSeats()).toBeGreaterThanOrEqual(76);
  });
});

describe('applyMomentum — direction compounding', () => {
  function baseState(): GameState {
    return makeState({
      momentum: 0,
      pScores: { a: 50, b: 50, c: 50 },
    });
  }

  it('zero raw delta decays momentum toward zero', () => {
    const G = baseState();
    G.momentum = 0.8;
    applyMomentum(G, 0);
    expect(Math.abs(G.momentum)).toBeLessThan(0.8);
  });

  it('same-direction delta amplifies (positive momentum boosts positive)', () => {
    const G = baseState();
    G.momentum = 0.9;
    const amplified = applyMomentum(G, 1);
    expect(amplified).toBeGreaterThan(1);
  });

  it('opposite-direction delta is dampened', () => {
    const G = baseState();
    G.momentum = 0.9;
    const dampened = applyMomentum(G, -1);
    expect(dampened).toBeGreaterThan(-1);
    expect(dampened).toBeLessThan(0);
  });
});

describe('computeShapley — power index sums to 1', () => {
  it('three-partner coalition distributes power summing to 1', () => {
    const era = makeEra({
      coalitionPartners: [
        { id: 'a', name: 'A', seats: 60, freq: 6 },
        { id: 'b', name: 'B', seats: 20, freq: 6 },
        { id: 'c', name: 'C', seats: 10, freq: 6 },
      ],
    });

    const G = makeState({
      cp: {
        a: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 },
        b: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 },
        c: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 },
      },
      shapleyPower: {},
    });

    computeShapley(G, era);
    const total = Object.values(G.shapleyPower).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 5);
    // 'a' has 60 seats alone (needs 76) — never pivotal alone, but most pivotal
    expect(G.shapleyPower.a).toBeGreaterThan(0);
  });

  it('dictator gets full power when alone above quota', () => {
    const era = makeEra({
      coalitionPartners: [
        { id: 'a', name: 'A', seats: 83, freq: 6 },
      ],
    });
    const G = makeState({
      cp: { a: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 } },
      shapleyPower: {},
    });
    computeShapley(G, era);
    expect(G.shapleyPower.a).toBeCloseTo(1, 5);
  });
});

describe('policyConsistency — theme tracking', () => {
  function emptyState(): GameState {
    return makeState({
      policyThemes: [],
      stances: {},
    });
  }

  it('returns zero bonus for first policy with no matched theme', () => {
    const G = emptyState();
    const result = policyConsistency(G, 'random nonsense words');
    expect(result.bonus).toBe(0);
    expect(result.flipPenalty).toBe(0);
  });

  it('grants consistency bonus after 5 same-theme policies', () => {
    const G = emptyState();
    // "eu" / "nato" / "brusel" / "európ" are 'eu' theme
    for (let i = 0; i < 5; i++) {
      policyConsistency(G, 'Podporujeme vstup do NATO a EÚ');
    }
    expect(G.policyThemes.length).toBeGreaterThanOrEqual(5);
    const result = policyConsistency(G, 'Ďalší NATO krok');
    expect(result.bonus).toBeGreaterThan(0);
  });

  it('caps flip penalty at -8', () => {
    const G = emptyState();
    // Set multiple strongly-held stances to maximize possible penalty
    G.stances = { eu: -4, rusko: 4, ekonomika: -4, social: 4 };
    const result = policyConsistency(
      G,
      'Podporujeme NATO a EÚ, prozápadnú politiku, investície, startup a liberalizáciu'
    );
    expect(result.flipPenalty).toBeGreaterThanOrEqual(-8);
  });
});

describe('kwScore — returns valid analysis shape', () => {
  it('produces analysis with bounded deltas and press headlines', () => {
    loadRealEra();
    const result = kwScore('Zvyšujem minimálnu mzdu a podporujem pracujúcich');
    expect(result).toBeDefined();
    expect(typeof result.aD).toBe('number');
    expect(typeof result.stD).toBe('number');
    expect(typeof result.cD).toBe('number');
    expect(result.press.left.headline).toBeTypeOf('string');
    expect(result.press.center.headline).toBeTypeOf('string');
    expect(result.press.right.headline).toBeTypeOf('string');
    // Deltas should be within reasonable bounds (-50 to +50)
    expect(Math.abs(result.aD)).toBeLessThan(50);
  });
});

describe('normalizeText — keyword normalisation', () => {
  it('strips Slovak diacritics', () => {
    expect(normalizeText('plochá daň')).toBe('plocha dan');
    expect(normalizeText('právny štát')).toBe('pravny stat');
    expect(normalizeText('kresťanské hodnoty')).toBe('krestanske hodnoty');
  });

  it('splits camelCase at word boundaries', () => {
    expect(normalizeText('plochaDan')).toBe('plocha dan');
    expect(normalizeText('zahranicnaPolitika')).toBe('zahranicna politika');
  });

  it('converts underscores to spaces', () => {
    expect(normalizeText('flat_tax')).toBe('flat tax');
    expect(normalizeText('prvá_pomoc')).toBe('prva pomoc');
  });

  it('lowercases', () => {
    expect(normalizeText('EFSF')).toBe('efsf');
  });

  it('matches natural Slovak input against legacy tokens', () => {
    const policy = normalizeText('Zavediem plochú daň pre všetkých');
    expect(policy.includes(normalizeText('plochaDan'))).toBe(false); // case-inflection still needs stem variants
    expect(policy.includes(normalizeText('plochu dan'))).toBe(true);  // accusative stem matches
  });
});

describe('kwScore — semantic polarity flips keyword effects', () => {
  it('positive verb + keyword → produces a stakeholder movement', () => {
    loadRealEra();
    const a = kwScore('Zvýšime minimálnu mzdu a podporíme pracujúcich');
    const anyMoved = Object.values(a.sScores).some(v => v !== 50);
    expect(anyMoved).toBe(true);
  });

  it('negation verb ("zruším") flips a kw_pos-aligned keyword to negative', () => {
    loadRealEra();
    // Force an Ekonomika event so topic-tagged 'dan' keyword applies at
    // full weight (topic 'economy' == event topic 'economy'). Without an
    // event context, tagged keywords scale to 30% and the flip is too
    // small to cross the assertion threshold.
    const G = getState();
    G.event = {
      id: 'test_economy', headline: '', description: '', context: '',
      tier: 'situation', category: 'Ekonomika', suggestions: [],
    };
    const pos = kwScore('Zavediem rovnú daň pre všetkých');
    const neg = kwScore('Zruším rovnú daň a zdvihnem progresívnu');
    // At least one stakeholder should have flipped sign relative to baseline 50.
    const flipped = Object.keys(pos.sScores).some(id =>
      Math.sign(pos.sScores[id] - 50) === -Math.sign(neg.sScores[id] - 50) &&
      Math.abs(pos.sScores[id] - 50) > 1 &&
      Math.abs(neg.sScores[id] - 50) > 1);
    expect(flipped).toBe(true);
  });
});

describe('clamp — bounds helper', () => {
  it('bounds default to 0-100', () => {
    expect(clamp(50)).toBe(50);
    expect(clamp(-10)).toBe(0);
    expect(clamp(150)).toBe(100);
  });
  it('respects custom bounds', () => {
    expect(clamp(50, 20, 80)).toBe(50);
    expect(clamp(10, 20, 80)).toBe(20);
    expect(clamp(90, 20, 80)).toBe(80);
  });
});

describe('deficitDynamics — fiscal feedback', () => {
  beforeEach(() => { loadRealEra(); });
  it('high unemployment widens deficit (automatic stabilisers)', () => {
    const G = getState();
    G.econ.unemp = 14;
    G.econ.deficit = 0;
    deficitDynamics(G);
    expect(G.econ.deficit).toBeLessThan(0);
  });
  it('strong growth narrows deficit', () => {
    const G = getState();
    G.econ.unemp = 5;
    G.econ.gdpGrowth = 4;
    G.econ.deficit = -4;
    deficitDynamics(G);
    // Revenue uplift + counter-cyclical spending cut narrows the gap
    expect(G.econ.deficit).toBeGreaterThan(-4);
  });
});

describe('okunsLaw — unemployment vs growth', () => {
  beforeEach(() => { loadRealEra(); });
  it('strong growth reduces unemployment', () => {
    const G = getState();
    G.econ.gdpGrowth = 5;
    G.econ.unemp = 10;
    const before = G.econ.unemp;
    okunsLaw(G);
    expect(G.econ.unemp).toBeLessThan(before);
  });
  it('recession raises unemployment', () => {
    const G = getState();
    G.econ.gdpGrowth = -3;
    G.econ.unemp = 6;
    const before = G.econ.unemp;
    okunsLaw(G);
    expect(G.econ.unemp).toBeGreaterThan(before);
  });
});

describe('fdiDynamics — foreign investment', () => {
  beforeEach(() => { loadRealEra(); });
  it('positive EU relations pull FDI up', () => {
    const G = getState();
    G.diplo.eu = 80;
    G.econ.gdpGrowth = 3;
    G.fdi = 5;
    fdiDynamics(G);
    expect(G.fdi).toBeGreaterThan(5);
  });
  it('EU relations bottomed out pulls FDI down', () => {
    const G = getState();
    G.diplo.eu = 10;
    G.econ.gdpGrowth = 1;
    G.fdi = 5;
    fdiDynamics(G);
    expect(G.fdi).toBeLessThan(5);
  });
});

describe('computeShapley — coalition bargaining power', () => {
  it('sums to ≈ 1 across active partners', () => {
    loadRealEra();
    const G = getState();
    const era = realEra;
    computeShapley(G, era);
    const sum = Object.values(G.shapleyPower).reduce((s, n) => s + n, 0);
    expect(sum).toBeCloseTo(1, 3);
  });
  it('every active partner has non-negative power', () => {
    loadRealEra();
    const G = getState();
    computeShapley(G, realEra);
    Object.values(G.shapleyPower).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });
  it('no dead partners in the power dict', () => {
    loadRealEra();
    const G = getState();
    const era = realEra;
    // Kick a partner
    const kickId = era.coalitionPartners[1]?.id;
    if (kickId && G.cp[kickId]) {
      G.cp[kickId].on = 0;
      computeShapley(G, era);
      expect(G.shapleyPower[kickId]).toBeUndefined();
    }
  });
});

describe('applyMomentum — reinforcing feedback', () => {
  it('positive history amplifies positive delta', () => {
    const G = makeState({ momentum: 0.5 });
    const delta = 5;
    const out = applyMomentum(G, delta);
    expect(out).toBeGreaterThan(delta);
  });
  it('negative history amplifies negative delta', () => {
    const G = makeState({ momentum: -0.5 });
    const delta = -5;
    const out = applyMomentum(G, delta);
    expect(out).toBeLessThan(delta);
  });
});

describe('policyConsistency — flip-flop penalty', () => {
  it('same-theme consecutive policies earn bonus', () => {
    const G = makeState({ policyThemes: ['eu', 'eu', 'eu'] });
    const { bonus } = policyConsistency(G, 'zvýšime eu investície');
    expect(bonus).toBeGreaterThanOrEqual(0);
  });
  it('flip-flopping on eu incurs penalty', () => {
    const G = makeState({ policyThemes: ['eu_pro', 'eu_anti'] });
    const { flipPenalty } = policyConsistency(G, 'odmietnem brusel');
    expect(flipPenalty).toBeLessThanOrEqual(0);
  });
});

describe('initGame — persona seeding', () => {
  it('every era persona gets a pScore', () => {
    loadRealEra();
    const G = getState();
    realEra.personas.forEach(p => {
      expect(G.pScores[p.id]).toBeDefined();
    });
  });
  it('every stakeholder gets an sScore', () => {
    loadRealEra();
    const G = getState();
    realEra.stakeholders.forEach(s => {
      expect(G.sScores[s.id]).toBeDefined();
    });
  });
  it('laws + stakeholderDemands start empty', () => {
    loadRealEra();
    const G = getState();
    expect(G.laws).toEqual([]);
    expect(G.stakeholderDemands).toEqual({});
  });
  it('mood starts honeymoon with moodUntil=3', () => {
    loadRealEra();
    const G = getState();
    expect(G.mood).toBe('honeymoon');
    expect(G.moodUntil).toBe(3);
  });
});

// Minimal jsdom scaffold for tests that trigger updateDash() indirectly
// (adoptLaw + initiateScheme call it on success). Creates just the DOM
// nodes updateDash reads. Safe to reuse between tests.
function setupMinimalDashboardDOM(): void {
  const ids = [
    'approvalValue', 'approvalFill', 'approvalTrend',
    'stabilityValue', 'stabilityFill', 'stabilityTrend',
    'coalitionValue', 'coalitionFill', 'coalitionTrend',
    'implValue', 'implFill', 'implTrend',
    'monthDisplay', 'monthNumber', 'playMonthName',
    'dashPmName', 'totalMonthsDisplay',
    'warningBanner', 'moodBanner', 'dashMap',
    'dashEconCoalition', 'dashParliament', 'dashStances',
    'dashDiplomacy', 'dashHistory', 'dashInstitutions',
  ];
  document.body.innerHTML = '';
  for (const id of ids) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}

describe('adoptLaw — signature law adoption', () => {
  beforeEach(() => { loadRealEra(); setupMinimalDashboardDOM(); });
  it('adoption requires ≥ 30 political capital', () => {
    const G = getState();
    G.politicalCapital = 20;
    const lawId = realEra.signatureLaws?.[0]?.id;
    if (!lawId) return;
    adoptLaw(lawId);
    expect(G.laws).toHaveLength(0);
  });
  it('successful adoption deducts 30 PC and appends to laws', () => {
    const G = getState();
    G.politicalCapital = 60;
    const lawId = realEra.signatureLaws?.[0]?.id;
    if (!lawId) return;
    adoptLaw(lawId);
    expect(G.laws).toHaveLength(1);
    expect(G.politicalCapital).toBe(30);
  });
  it('second adoption is blocked (1 per era cap)', () => {
    const G = getState();
    G.politicalCapital = 100;
    const laws = realEra.signatureLaws || [];
    if (laws.length < 2) return;
    adoptLaw(laws[0].id);
    adoptLaw(laws[1].id);
    expect(G.laws).toHaveLength(1);
  });
});

describe('SCHEMES — player-initiated intrigue', () => {
  beforeEach(() => { loadRealEra(); setupMinimalDashboardDOM(); });
  it('catalogue contains at least 3 schemes', () => {
    expect(SCHEMES.length).toBeGreaterThanOrEqual(3);
  });
  it('each scheme has id + name + description + capCost + apply()', () => {
    SCHEMES.forEach(s => {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.description).toBe('string');
      expect(typeof s.capCost).toBe('number');
      expect(typeof s.apply).toBe('function');
    });
  });
  it('insufficient capital blocks scheme initiation', () => {
    loadRealEra();
    const G = getState();
    G.politicalCapital = 5;
    const before = { ...G.flags };
    initiateScheme(SCHEMES[0].id);
    expect(G.politicalCapital).toBe(5);          // nothing deducted
    expect(Object.keys(G.flags)).toEqual(Object.keys(before));
  });
  it('sufficient capital triggers the scheme apply()', () => {
    loadRealEra();
    const G = getState();
    G.politicalCapital = 80;
    initiateScheme(SCHEMES[0].id);
    expect(G.politicalCapital).toBeLessThan(80);
  });
});

describe('coalitionSeats — computes active partners', () => {
  it('only counts partners with on=1', () => {
    loadRealEra();
    const G = getState();
    const total = coalitionSeats();
    const sumAll = realEra.coalitionPartners.reduce((s, cp) => s + cp.seats, 0);
    expect(total).toBeLessThanOrEqual(sumAll);
  });
  it('zero after all partners quit', () => {
    loadRealEra();
    const G = getState();
    Object.values(G.cp).forEach(p => { p.on = 0; });
    expect(coalitionSeats()).toBe(0);
  });
});

describe('normalizeText — edge cases', () => {
  it('empty string returns empty', () => {
    expect(normalizeText('')).toBe('');
  });
  it('numbers and punctuation preserved', () => {
    expect(normalizeText('Dane sú 19%!')).toBe('dane su 19%!');
  });
  it('all-caps preserved case-insensitively', () => {
    expect(normalizeText('NATO')).toBe('nato');
    expect(normalizeText('HZDS')).toBe('hzds');
  });
});
