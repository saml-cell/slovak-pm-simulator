// ═══════════════════════════════════════════════════════════
//                    ERA CONFIG TYPES
// ═══════════════════════════════════════════════════════════

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  age: number;
  demo: string;
  location: string;
  region: string;
  lean: string;
}

export interface PersonaQuotes {
  [personaId: string]: {
    vp: string[];
    p: string[];
    n: string[];
    ng: string[];
    vn: string[];
  };
}

export interface Politician {
  id: string;
  name: string;
  party: string;
  role: string;
  emoji: string;
  kw_pos: string[];
  kw_neg: string[];
  reactions: {
    pos: string[];
    neg: string[];
    neu: string[];
  };
}

export interface CoalitionPartner {
  id: string;
  name: string;
  seats: number;
  freq: number;
}

export interface Demand {
  partner: string;
  text: string;
}

export interface Region {
  id: string;
  name: string;
  pop: number;
  personas: string[];
}

export interface Stakeholder {
  id: string;
  name: string;
  desc: string;
  fp?: number;
  type?: string;
  seats?: number;
  color?: string;
}

interface DiploEntity {
  key: string;
  name: string;
  emoji?: string;
}

export interface KeywordEffect {
  p?: Record<string, number>;
  s?: Record<string, number>;
  dp?: Record<string, number>;
  e?: Record<string, number>;
}

export interface GameEvent {
  id: string;
  m?: number;
  h: string;
  d: string;
  c: string;
  t: string;
  cat: string;
  s: string[];
}

export interface HeadlineEntry {
  kw: string[];
  h: string;
  sub: string;
}

export interface CalendarConfig {
  startMonthOffset: number;
  startYear: number;
}

export interface TitleScreenConfig {
  pmName: string;
  subtitle: string;
  description: string;
  startButtonText: string;
}

export interface RealComparisonStat {
  value: number;
  label: string;
}

export interface RealComparison {
  approval: RealComparisonStat;
  gdpGrowth: RealComparisonStat;
  unemployment: RealComparisonStat;
  inflation: RealComparisonStat;
  lasted: RealComparisonStat;
  verdict: string;
}

export interface EraMeta {
  id: string;
  pmName: string;
  headerTitle: string;
  saveKey: string;
  pellegriniMonth: number;
  presidentName?: string;
  presidentFriendly?: string;
  currency?: string;
  currencyBig?: string;
  realComparison?: RealComparison;
}

export interface EconomyState {
  gdp: number;
  gdpGrowth: number;
  unemp: number;
  infl: number;
  deficit: number;
  debt: number;
  minW: number;
}

export interface CoalitionPartnerState {
  on: number;
  sat: number;
  pat: number;
  dem: string | null;
  lastD: number;
}

export interface InitialState {
  approval: number;
  stability: number;
  coalition: number;
  impl: number;
  econ: EconomyState;
  diplo: Record<string, number>;
  social: Record<string, number>;
  cp: Record<string, CoalitionPartnerState>;
  parl: Record<string, number>;
  stances: Record<string, number>;
}

export interface PartyDisplay {
  colors: Record<string, string>;
  names: Record<string, string>;
}

export interface EraConfig {
  meta: EraMeta;
  calendar: CalendarConfig;
  totalMonths: number;
  gameOverThreshold: number;
  titleScreen: TitleScreenConfig;
  partyDisplay: PartyDisplay;
  personas: Persona[];
  personaQuotes: PersonaQuotes;
  politicians: Politician[];
  coalitionPartners: CoalitionPartner[];
  demands: Demand[];
  regions: Region[];
  stakeholders: Stakeholder[];
  diplomacy: DiploEntity[];
  keywords: Record<string, KeywordEffect>;
  forcedEvents: GameEvent[];
  randomEvents: GameEvent[];
  consequenceChains?: { flag: string; delay: number; prob: number; ev: { h: string; d: string; c: string; t: string; cat: string; s: string[] } }[];
  headlines: {
    left: { name: string; entries: HeadlineEntry[]; fallback?: { headline: string; subhead: string } };
    center: { name: string; entries: HeadlineEntry[]; fallback?: { headline: string; subhead: string } };
    right: { name: string; entries: HeadlineEntry[]; fallback?: { headline: string; subhead: string } };
  };
  initialState: InitialState;
}

// ═══════════════════════════════════════════════════════════
//                    GAME STATE TYPES
// ═══════════════════════════════════════════════════════════

export interface ConsequenceQueueItem {
  ev: { h?: string; headline?: string; d?: string; description?: string; c?: string; context?: string; cat?: string; s?: string[]; suggestions?: string[] };
  fire: number;
  originP: string;
  originM: number;
  prob: number;
}

export interface HistoryEntry {
  m: number;
  p: string;
  spin: string;
  ev: string;
}

export interface ActiveEvent {
  id: string;
  headline: string;
  description: string;
  context: string;
  tier: string;
  category: string;
  suggestions: string[];
  originPolicy?: string;
  originMonth?: number;
}

export interface AnalysisResult {
  aD: number;
  stD: number;
  cD: number;
  pScores: Record<string, number>;
  sScores: Record<string, number>;
  econFx: Record<string, number>;
  diploFx: Record<string, number>;
  cs: {
    summary: string;
    risk: string;
    treasuryCost: string;
    growthPotential: string;
    complexity: string;
    publicSensitivity: string;
    recommendation: string;
  };
  press: {
    left: { headline: string; subhead: string };
    center: { headline: string; subhead: string };
    right: { headline: string; subhead: string };
  };
  cb: {
    parliament: number;
    court: number;
    president: number;
    implementationRate: number;
    reasons?: Record<string, string>;
  };
  consequence: { headline: string; description: string; delay: number; probability: number } | null;
  flags: Record<string, boolean>;
  socialFx: Record<string, number>;
}

export interface GameState {
  month: number;
  approval: number;
  stability: number;
  coalition: number;
  impl: number;
  prevA: number;
  prevS: number;
  prevC: number;
  prevImpl: number;
  history: HistoryEntry[];
  approvalH: number[];
  pScores: Record<string, number>;
  sScores: Record<string, number>;
  econ: EconomyState;
  diplo: Record<string, number>;
  social: Record<string, number>;
  cp: Record<string, CoalitionPartnerState>;
  parl: Record<string, number>;
  flags: Record<string, boolean>;
  cq: ConsequenceQueueItem[];
  used: Set<string>;
  analysis: AnalysisResult | null;
  event: ActiveEvent | null;
  pellegrini: boolean;
  stances: Record<string, number>;
  momentum: number;
  policyThemes: string[];
  oppositionPressure: number;
  businessCycle: number;       // -1 to 1, sine wave position
  politicalCapital: number;    // 0-100, depletes with action, recharges with quiet months
  crisisFatigue: number;       // 0-1, how exhausted voters are from constant crises
  euFundsFlow: number;         // 0-10, billions flowing from EU per year based on diplo.eu
  debtToGdp: number;
  fdi: number;
  mediaCycle: number;
  mediaCycleEvent: string;
  pollApproval: number;
  pollError: number;
  interestRate: number;
  laborParticipation: number;
  shapleyPower: Record<string, number>;
  brainDrain: number; // 0-100, cumulative emigration pressure
  oligarchicTies: number; // 0-100, hidden corruption exposure
}
