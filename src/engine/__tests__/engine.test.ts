import { describe, it, expect, beforeEach } from 'vitest';
import { esc, normalizeText } from '../sanitize';
import {
  setEra, initGame, coalitionSeats, getState,
  initCalendar, getCalendarDate, getFullDate,
} from '../state';
import {
  applyMomentum, computeShapley, policyConsistency,
} from '../advanced';
import { kwScore } from '../scoring';
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
