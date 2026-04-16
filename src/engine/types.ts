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
  type?: string;
  seats?: number;
  color?: string;
}

export interface DiploEntity {
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

export interface PressHeadline {
  headline: string;
  subhead: string;
}

export interface HeadlineOutlet {
  name: string;
  entries: HeadlineEntry[];
  fallback?: PressHeadline;
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
  presidentUnfriendlyMonth?: number;
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
  quietMonths?: { h: string; d: string; c: string }[];
  consequenceChains?: { flag: string; delay: number; prob: number; ev: { h: string; d: string; c: string; t: string; cat: string; s: string[] } }[];
  headlines: {
    left: HeadlineOutlet;
    center: HeadlineOutlet;
    right: HeadlineOutlet;
  };
  initialState: InitialState;
  court?: CourtConfig;
  cabinet?: CabinetConfig;
  institutions?: InstitutionsConfig;
}

export interface CourtJudge {
  id: string;
  name: string;
  ideology: number;    // 1 (liberal/reform) to 10 (nationalist/authoritarian)
  competence: number;  // 1-10
  conviction: number;  // 1-10, resistance to political pressure
  loyalty: number;     // 1-10, willingness to rule in PM's favor
  termEnd: number;     // month when term expires (-1 = indefinite)
  isChair: boolean;
}

export interface CourtConfig {
  judges: CourtJudge[];
}

export interface CourtState {
  judges: CourtJudge[];
  pendingVacancies: number;
  courtPrestige: number;     // 0-100
}

export interface Minister {
  id: string;
  name: string;
  party: string;            // coalition partner id
  ministry: string;         // ministry id
  ideology: number;         // 1-10
  competence: number;       // 1-10
  loyalty: number;          // 1-10, to PM
  partyLoyalty: number;     // 1-10, to their own party
  corruption: number;       // 0-10, scandal risk
  publicProfile: number;    // 1-10
}

export interface Ministry {
  id: string;
  name: string;              // Slovak name
  emoji: string;
  domain: string[];          // policy keywords this ministry affects
  allocatedTo: string;       // coalition partner id
}

export interface CabinetConfig {
  ministries: Ministry[];
  ministers: Minister[];               // starting ministers
}

export interface CabinetState {
  ministers: Minister[];
  cabinetCohesion: number;   // 0-100
  reshuffleCount: number;
}

export interface InstitutionHead {
  id: string;
  name: string;
  institution: string;      // institution id
  ideology: number;
  competence: number;
  loyalty: number;           // to PM
  conviction: number;        // resistance to pressure
  termEnd: number;           // month when term expires (-1 = at-will)
  appointedBy: string;       // PM name/era
}

export interface Institution {
  id: string;
  name: string;
  emoji: string;
  appointedBy: string;       // 'pm_parliament' | 'interior' | 'president' | 'parliament'
  replaceCost: number;       // political capital cost 5-40
  description: string;
}

export interface InstitutionsConfig {
  institutions: Institution[];
  heads: InstitutionHead[];
}

export interface InstitutionsState {
  heads: InstitutionHead[];
  institutionalIntegrity: number;  // 0-100
  capturedCount: number;
}

export interface ConsequenceQueueItem {
  ev: { h?: string; d?: string; c?: string; cat?: string; s?: string[] };
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
    left: PressHeadline;
    center: PressHeadline;
    right: PressHeadline;
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
  court: CourtState;
  cabinet: CabinetState;
  institutions: InstitutionsState;
}

/** Shape expected from AI JSON responses (before normalization). */
export interface RawAIResult {
  approvalDelta?: number;
  stabilityDelta?: number;
  coalitionDelta?: number;
  personaScores?: Record<string, number>;
  stakeholderScores?: Record<string, number>;
  economyEffects?: Record<string, number>;
  diplomacyChanges?: Record<string, number>;
  civilService?: AnalysisResult['cs'];
  press?: AnalysisResult['press'];
  checksAndBalances?: AnalysisResult['cb'];
  consequence?: AnalysisResult['consequence'];
  flags?: Record<string, boolean>;
  socialEffects?: Record<string, number>;
}

export interface AnalyticsData {
  era?: string;
  month?: number;
  approval?: number;
  stability?: number;
  coalition?: number;
}

export interface LeaderboardEntry {
  era: string;
  pm: string;
  approval: number;
  stability: number;
  months: number;
  won: boolean;
  date: string;
}

export interface PuterChatMessage {
  role: string;
  content: string;
}

export interface PuterChatResponse {
  message?: { content?: Array<{ text: string }> | string };
  text?: string;
}

declare global {
  interface Window {
    __shareUrl?: string;
    __updateCC: () => void;
    __doKick: (id: string) => void;
    __closeModal: () => void;
    __handleDem: (id: string, action: string) => void;
    __kickP: (id: string) => void;
  }
}
