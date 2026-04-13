import { describe, it, expect, beforeEach } from 'vitest';
import { esc } from '../sanitize';
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

const realEra = eraJson as unknown as EraConfig;

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
    return {
      momentum: 0,
      pScores: { a: 50, b: 50, c: 50 },
    } as unknown as GameState;
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
    const era = {
      coalitionPartners: [
        { id: 'a', name: 'A', seats: 60, freq: 6 },
        { id: 'b', name: 'B', seats: 20, freq: 6 },
        { id: 'c', name: 'C', seats: 10, freq: 6 },
      ],
    } as unknown as EraConfig;

    const G = {
      cp: {
        a: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 },
        b: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 },
        c: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 },
      },
      shapleyPower: {},
    } as unknown as GameState;

    computeShapley(G, era);
    const total = Object.values(G.shapleyPower).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 5);
    // 'a' has 60 seats alone (needs 76) — never pivotal alone, but most pivotal
    expect(G.shapleyPower.a).toBeGreaterThan(0);
  });

  it('dictator gets full power when alone above quota', () => {
    const era = {
      coalitionPartners: [
        { id: 'a', name: 'A', seats: 83, freq: 6 },
      ],
    } as unknown as EraConfig;
    const G = {
      cp: { a: { on: 1, sat: 50, pat: 50, dem: null, lastD: 0 } },
      shapleyPower: {},
    } as unknown as GameState;
    computeShapley(G, era);
    expect(G.shapleyPower.a).toBeCloseTo(1, 5);
  });
});

describe('policyConsistency — theme tracking', () => {
  function emptyState(): GameState {
    return {
      policyThemes: [],
      stances: {},
    } as unknown as GameState;
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
