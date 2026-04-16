import type { EraConfig, GameState } from './types';

let _era: EraConfig | null = null;
let _state: GameState | null = null;

export function setEra(era: EraConfig) { _era = era; }

export function getEra(): EraConfig {
  if (!_era) throw new Error('Era not loaded');
  return _era;
}

export function getState(): GameState {
  if (!_state) throw new Error('Game not initialized');
  return _state;
}


export function initGame(): GameState {
  const era = getEra();
  const s = era.initialState;
  const G: GameState = {
    month: 0,
    approval: s.approval,
    stability: s.stability,
    coalition: s.coalition,
    impl: s.impl,
    prevA: s.approval,
    prevS: s.stability,
    prevC: s.coalition,
    prevImpl: s.impl,
    history: [],
    approvalH: [s.approval],
    pScores: {},
    sScores: {},
    econ: { ...s.econ },
    diplo: { ...s.diplo },
    social: { ...s.social },
    cp: JSON.parse(JSON.stringify(s.cp)),
    parl: { ...s.parl },
    flags: {},
    cq: [],
    used: new Set(),
    analysis: null,
    event: null,
    pellegrini: era.meta.presidentUnfriendlyMonth !== undefined || era.meta.pellegriniMonth === 0,
    stances: { ...s.stances },
    momentum: 0,
    policyThemes: [],
    oppositionPressure: 20,
    businessCycle: 0,
    politicalCapital: 80,
    crisisFatigue: 0,
    euFundsFlow: 5,
    debtToGdp: s.econ.gdp > 0 ? (s.econ.debt / s.econ.gdp) * 100 : 50,
    fdi: 5,
    mediaCycle: 0,
    mediaCycleEvent: '',
    pollApproval: s.approval + (Math.random() * 6 - 3),
    pollError: Math.random() * 4 - 2,
    interestRate: (s.econ.debt / Math.max(1, s.econ.gdp) * 100) > 60 ? 4.0 : 2.5,
    laborParticipation: 65,
    shapleyPower: {},
    brainDrain: 0,
    oligarchicTies: 0,
    court: {
      judges: era.court ? JSON.parse(JSON.stringify(era.court.judges)) : [],
      pendingVacancies: 0,
      courtPrestige: era.court ? 60 : 50,
    },
    cabinet: {
      ministers: era.cabinet ? JSON.parse(JSON.stringify(era.cabinet.ministers)) : [],
      cabinetCohesion: 70,
      reshuffleCount: 0,
    },
    institutions: {
      heads: era.institutions ? JSON.parse(JSON.stringify(era.institutions.heads)) : [],
      institutionalIntegrity: 60,
      capturedCount: 0,
    },
  };
  era.personas.forEach(p => {
    const leanScores: Record<string, number> = {
      smer: 70, hzds: 70, zrs: 65,
      progressive: 30, opposition: 25,
      moderate: 50, conservative: 45,
      far_right: 55, apolitical: 50,
      hungarian: 35, sns: 60, kdh: 40,
    };
    G.pScores[p.id] = leanScores[p.lean] ?? 50;
  });
  era.stakeholders.forEach(st => {
    const typeScores: Record<string, number> = {
      coalition: 65, opposition: 25, media: 35,
      economy: 50, institution: 50, international: 45,
    };
    G.sScores[st.id] = typeScores[st.type || ''] ?? 50;
  });
  _state = G;
  return G;
}

function makeCalendarFns(config: EraConfig['calendar']) {
  const short = ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  const full = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
  return {
    getCalendarDate(i: number): string {
      const m = (config.startMonthOffset + i) % 12;
      const y = config.startYear + Math.floor((config.startMonthOffset + i) / 12);
      return short[m] + ' ' + y;
    },
    getFullDate(i: number): string {
      const m = (config.startMonthOffset + i) % 12;
      const y = config.startYear + Math.floor((config.startMonthOffset + i) / 12);
      return full[m] + ' ' + y;
    },
  };
}

let _calFns: ReturnType<typeof makeCalendarFns> | null = null;

export function initCalendar(config: EraConfig['calendar']) {
  _calFns = makeCalendarFns(config);
}

export function getCalendarDate(i: number): string {
  return _calFns!.getCalendarDate(i);
}

export function getFullDate(i: number): string {
  return _calFns!.getFullDate(i);
}

export function coalitionSeats(): number {
  const G = getState();
  const era = getEra();
  return era.coalitionPartners.reduce((sum, cp) => sum + (G.cp[cp.id]?.on ? cp.seats : 0), 0);
}
