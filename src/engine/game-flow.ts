import type { AnalysisResult, EconomyState, GameState, LeaderboardEntry } from './types';
import { getEra, getState, getCalendarDate } from './state';
import { showScreen } from './screen';
import { updateDash } from './render/dashboard';
import { esc, normalizeText } from './sanitize';
import { trackAnalytics } from './analytics';
import { clamp, applyMomentum, socialInfluence, econFeedback, policyConsistency, oppositionMove, nashBargaining, simulateElection, businessCycleTick, deficitDynamics, euFundsLink, smartMinWage, econCrisisCheck, incumbencyPenalty, crisisFatigueTick, politicalCapitalTick, diploFeedback, computeShapley, fiscalHealth, fdiDynamics, okunsLaw, mediaCycleTick, updatePolling, laborMarketTick, brainDrainTick, oligarchicTick, mediaEcosystemTick, courtTick, courtIdeologyScore, cabinetTick, cabinetImplementationMod, institutionsTick } from './advanced';

// Stakeholder demands (Tropico-style faction demands extended to non-
// coalition groups). Every 5 months, scan stakeholders. If sScore < 45
// and no active demand, post one — drawn from era.demands matching the
// stakeholder id, or generated. Player addresses by writing a policy
// that touches the stakeholder's topic. Unaddressed demands decay
// sScore by ~2/month while active.
function updateStakeholderDemands(G: GameState, era: ReturnType<typeof getEra>): string[] {
  const messages: string[] = [];
  const coalitionIds = new Set(era.coalitionPartners.map(cp => cp.id));

  // Decay any active demand that's been hanging > 1 month
  for (const [sid, dem] of Object.entries(G.stakeholderDemands)) {
    const age = G.month - dem.postedAt;
    if (age >= 1) {
      G.sScores[sid] = Math.max(5, (G.sScores[sid] || 50) - 2);
    }
    if (age >= 4) {
      // Demand expired unaddressed — sticks as long-term grudge flag
      G.flags[`demand_unmet_${sid}`] = true;
      delete G.stakeholderDemands[sid];
      messages.push(`💢 ${sid.toUpperCase()}: požiadavka nesplnená — obvinia vládu z ignorovania.`);
    }
  }

  // Publish new demands every 5 months
  if (G.month > 0 && G.month % 5 === 0) {
    for (const sh of era.stakeholders) {
      if (coalitionIds.has(sh.id)) continue;        // coalition uses its own plot path
      if (G.stakeholderDemands[sh.id]) continue;    // already has a demand
      const sScore = G.sScores[sh.id] || 50;
      if (sScore >= 45) continue;                   // happy enough — no demand
      // Find an era demand matching this stakeholder, fallback to generic
      const matched = era.demands.find(d => d.partner === sh.id);
      const text = matched
        ? matched.text
        : `${sh.name} žiada vládu, aby sa konkrétne zaoberala ich situáciou.`;
      G.stakeholderDemands[sh.id] = {
        text, postedAt: G.month,
      };
      messages.push(`📣 ${sh.name}: ${text}`);
    }
  }

  return messages;
}

// Coalition-partner plot state machine. Partners whose satisfaction stays
// below 40 start plotting (plotSince set to current month). After 4 months
// of unresolved plotting they either defect outright (20% chance per month
// past the threshold, capped) or force a demand event on the player.
// Returning sat to ≥ 50 cancels the plot.
// Returns a flavor message describing the most severe active plot for the
// dashboard banner, or '' if nothing plot-worthy.
function updateCoalitionPlots(G: GameState): string {
  const messages: string[] = [];
  let defectionHappened = false;
  for (const [id, p] of Object.entries(G.cp)) {
    if (!p.on) continue;
    // Start plotting
    if (p.sat < 40 && !p.plotSince) {
      p.plotSince = G.month;
    }
    // Cancel plot on recovery
    if (p.sat >= 50 && p.plotSince) {
      p.plotSince = null;
      continue;
    }
    // Resolve plot
    if (p.plotSince !== null && p.plotSince !== undefined) {
      const age = G.month - p.plotSince;
      if (age >= 4) {
        // 25% per month past age 4 — defects within a few more turns
        if (Math.random() < 0.25) {
          p.on = 0;
          p.sat = 10;
          p.plotSince = null;
          G.stability = Math.max(0, G.stability - 25);
          G.coalition = Math.max(0, G.coalition - 15);
          G.flags[id + '_defected'] = true;
          messages.push(`💥 ${id.toUpperCase()} opustil koalíciu po dlhom napätí.`);
          defectionHappened = true;
        } else {
          // Publish demand — stays in plot state, surfaces a warning
          p.dem = `${id.toUpperCase()} žiada ústupky — inak zvažuje odchod.`;
          messages.push(`⚠️ ${id.toUpperCase()} tlačí na vládu — štvorica mesiacov nespokojnosti sa blíži k rozbúrke.`);
        }
      } else if (age >= 2) {
        messages.push(`🕯️ ${id.toUpperCase()} rokuje za zatvorenými dverami.`);
      }
    }
  }
  return messages.join('<br>') + (defectionHappened ? '' : '');
}

// Mood state machine. The mood colours every turn's approval/stability
// deltas and is surfaced as a tinted banner on the dashboard. Transitions:
//   start-of-era           -> honeymoon (first 3 months)
//   honeymoon expires      -> normal
//   crisis flag becomes true -> crisis (for 4 months)
//   national_tragedy flag  -> mourning (for 2 months)
//   mourning/crisis expire -> normal
//
// Crisis flags are any of: assassination, bank_collapse, eu_sanctions,
// national_tragedy, covid_active. If multiple apply, mourning wins over
// crisis (tragedy > external crisis). Honeymoon never re-triggers.
const CRISIS_FLAGS = ['assassination', 'bank_collapse', 'eu_sanctions', 'covid_active'];

function updateMood(G: GameState): void {
  const hasTragedy = !!G.flags['national_tragedy'] || !!G.flags['national_unity'];
  const hasCrisis = CRISIS_FLAGS.some(f => G.flags[f]);

  if (hasTragedy && G.mood !== 'mourning') {
    G.mood = 'mourning';
    G.moodUntil = G.month + 2;
    return;
  }
  if (hasCrisis && G.mood !== 'crisis' && G.mood !== 'mourning') {
    G.mood = 'crisis';
    G.moodUntil = G.month + 4;
    return;
  }
  if (G.mood !== 'normal' && G.month >= G.moodUntil) {
    G.mood = 'normal';
  }
}

function moodMultiplier(G: GameState): { approvalMult: number; stabilityMult: number; coalitionMult: number } {
  switch (G.mood) {
    case 'honeymoon': return { approvalMult: 1.1, stabilityMult: 1.0, coalitionMult: 1.0 };
    case 'crisis':    return { approvalMult: 1.5, stabilityMult: 1.3, coalitionMult: 1.2 };
    case 'mourning':  return { approvalMult: 1.0, stabilityMult: 1.0, coalitionMult: 1.0 };
    default:          return { approvalMult: 1.0, stabilityMult: 1.0, coalitionMult: 1.0 };
  }
}

function clampEcon(G: GameState): void {
  G.econ.gdpGrowth = clamp(G.econ.gdpGrowth, -5, 15);
  G.econ.unemp = clamp(G.econ.unemp, 2, 30);
  G.econ.infl = clamp(G.econ.infl, 0, 25);
}

function blendScores(target: Record<string, number>, source: Record<string, number>): void {
  Object.entries(source).forEach(([id, nv]) => {
    const pv = target[id] || 50;
    const bl = nv > pv ? .4 : .5;
    target[id] = clamp(pv * (1 - bl) + nv * bl, 5, 95);
  });
}

function renderApprovalChart(G: GameState): string {
  return G.approvalH.map((v, i) =>
    `<div class="chart-bar" style="height:${(v / 100) * 160}px"><div class="chart-bar-label">${i % 6 === 0 ? getCalendarDate(i).substring(0, 3) : ''}</div></div>`
  ).join('');
}

function handleDem(id: string, action: string) {
  const G = getState();
  const p = G.cp[id];
  if (!p || !p.dem) return;
  if (action === 'c') { p.sat = Math.min(100, p.sat + 15); p.pat = Math.min(100, p.pat + 10); G.coalition = Math.min(100, G.coalition + 5); Object.entries(G.cp).forEach(([oid, op]) => { if (oid !== id && op.on) op.sat = Math.max(0, op.sat - 5); }); }
  else if (action === 'n') { p.sat = Math.min(100, p.sat + 5); p.pat = Math.min(100, p.pat + 5); }
  else { p.sat = Math.max(0, p.sat - 15); p.pat = Math.max(0, p.pat - 10); G.coalition = Math.max(0, G.coalition - 5); }
  p.dem = null;
  updateDash();
}

function kickP(id: string) {
  const era = getEra();
  const cp = era.coalitionPartners.find(x => x.id === id);
  if (!cp) return;
  if (id === era.coalitionPartners[0]?.id) return;
  const el = (eid: string) => document.getElementById(eid)!;
  el('modalTitle').textContent = 'Vyhodiť ' + cp.name + '?';
  el('modalText').textContent = 'Stratíte ' + cp.seats + ' kresiel. Stabilita výrazne klesne.';
  el('modalActions').innerHTML = `<button class="partner-btn kick" onclick="window.__doKick('${esc(id)}');window.__closeModal()">Potvrdiť</button><button class="partner-btn negotiate" onclick="window.__closeModal()">Zrušiť</button>`;
  document.getElementById('coalitionModal')!.classList.add('active');
}

function doKick(id: string) {
  const G = getState();
  G.cp[id].on = 0;
  G.cp[id].sat = 10;
  G.sScores[id] = 10;
  G.stability = Math.max(0, G.stability - 25);
  G.coalition = Math.max(0, G.coalition - 15);
  G.flags[id + '_kicked'] = true;
  updateDash();
}

function closeModal() {
  document.getElementById('coalitionModal')!.classList.remove('active');
}

// Signature law: one per era, irreversible.
// Adopted via the "Prijať zákon" action on the dashboard. Adoption costs
// 30 political capital + applies econOnce + flags immediately. After
// adoption, the approval/stability/coalition monthly modifiers are added
// in proceed().
export function adoptLaw(lawId: string): void {
  const G = getState();
  const era = getEra();
  if (G.laws.length > 0) return;  // cap: 1 per era
  const law = (era.signatureLaws || []).find(l => l.id === lawId);
  if (!law) return;
  if (G.politicalCapital < 30) return;
  G.politicalCapital -= 30;
  G.laws.push(law);
  if (law.flags) Object.assign(G.flags, law.flags);
  if (law.econOnce) {
    Object.entries(law.econOnce).forEach(([k, d]) => {
      if (d === undefined) return;
      const ek = k as keyof EconomyState;
      if (ek in G.econ) G.econ[ek] = (G.econ[ek] as number) + d;
    });
  }
  updateDash();
}

window.__adoptLaw = adoptLaw;

// Player-initiated intrigue actions (CK3-style schemes, minimum viable).
// Three generic schemes available to any era. Each costs political capital
// and applies an immediate effect; no multi-month progress bars in this
// PoC. Future expansion: era-specific schemes with scheduled reveal.
export interface SchemeOption {
  id: string;
  name: string;
  description: string;
  capCost: number;
  apply: (G: GameState) => string;  // returns a flavour message
}

export const SCHEMES: SchemeOption[] = [
  {
    id: 'press_leak',
    name: 'Únik do médií',
    description: 'Tajne dodáte spis novinárom. Opozícia oslabne, ale ak sa to prevalí, vážny škandál.',
    capCost: 20,
    apply: (G) => {
      G.oppositionPressure = Math.max(0, G.oppositionPressure - 10);
      if (Math.random() < 0.25) {
        G.flags.scheme_leak_exposed = true;
        G.approval = clamp(G.approval - 5);
        return '🔍 Únik prevalený! Opozícia získala kompromat — podpora −5.';
      }
      return '📰 Únik bol úspešný — opozícia stratila pôdu pod nohami.';
    },
  },
  {
    id: 'commission_poll',
    name: 'Objednať prieskum',
    description: 'Súkromný prieskum, ktorý ukáže reálnu podporu po regiónoch. Pomôže pri ďalšom rozhodnutí.',
    capCost: 10,
    apply: (G) => {
      G.flags.fresh_poll_data = true;
      G.pollError = Math.max(0.5, G.pollError * 0.4);
      return `📊 Prieskum: pollApproval ${Math.round(G.pollApproval)} ± ${G.pollError.toFixed(1)}%.`;
    },
  },
  {
    id: 'oligarch_bribe',
    name: 'Tajná dohoda s oligarchom',
    description: 'Oligarch dodá hlasy v parlamente výmenou za regulačnú výhodu. Riziko expozície vás môže zničiť.',
    capCost: 30,
    apply: (G) => {
      G.oligarchicTies = Math.min(100, G.oligarchicTies + 5);
      G.coalition = clamp(G.coalition + 4);
      Object.values(G.cp).forEach(cp => { if (cp.on) cp.sat = Math.min(100, cp.sat + 3); });
      if (Math.random() < 0.15) {
        G.flags.scheme_bribe_exposed = true;
        G.approval = clamp(G.approval - 10);
        G.stability = clamp(G.stability - 8);
        return '⚖️ Dohoda prevalená! Médiá majú dôkazy — podpora −10, stabilita −8.';
      }
      return '🤝 Dohoda uzavretá — koalícia pevnejšia o niekoľko percent.';
    },
  },
];

export function initiateScheme(schemeId: string): void {
  const G = getState();
  const scheme = SCHEMES.find(s => s.id === schemeId);
  if (!scheme) return;
  if (G.politicalCapital < scheme.capCost) return;
  G.politicalCapital -= scheme.capCost;
  const msg = scheme.apply(G);
  G.flags[`scheme_used_${schemeId}_${G.month}`] = true;
  updateDash();
  // Surface flavour in the warning banner area
  const wb = document.getElementById('warningBanner');
  if (wb) {
    wb.innerHTML = (wb.innerHTML ? wb.innerHTML + '<br>' : '') + msg;
    wb.classList.add('show');
  }
}

window.__initiateScheme = initiateScheme;

// Nominate a loyalist judge to the Constitutional Court. Costs 25 PC and
// 5 stability. Adds a judge with high loyalty + ideology-aligned but
// moderate competence. Each nomination risks EU backlash if integrity
// drops too low. Practical effect: friendly court boosts implementation
// rate and is less likely to block controversial laws.
export function nominateJudge(): void {
  const G = getState();
  if (G.politicalCapital < 25) return;
  if (G.court.judges.length >= 13) return;
  G.politicalCapital -= 25;
  G.stability = clamp(G.stability - 3);
  const nextId = 'j' + (G.court.judges.length + Math.floor(Math.random() * 1000));
  G.court.judges.push({
    id: nextId,
    name: `Sudca ${String.fromCharCode(65 + (G.court.judges.length % 26))}.`,
    ideology: 4 + Math.floor(Math.random() * 4),  // 4-7, centrist to slightly nationalist
    competence: 5 + Math.floor(Math.random() * 4),
    conviction: 3 + Math.floor(Math.random() * 3),  // lower = more pressure-susceptible
    loyalty: 7 + Math.floor(Math.random() * 3),    // 7-9, friendly
    termEnd: G.month + 120,
    isChair: false,
  });
  G.court.pendingVacancies = Math.max(0, G.court.pendingVacancies - 1);
  G.institutions.institutionalIntegrity = Math.max(0, G.institutions.institutionalIntegrity - 2);
  const wb = document.getElementById('warningBanner');
  if (wb) {
    wb.innerHTML = (wb.innerHTML ? wb.innerHTML + '<br>' : '') + '⚖️ Nominovaný lojálny sudca — integrita inštitúcií −2.';
    wb.classList.add('show');
  }
  updateDash();
}

window.__nominateJudge = nominateJudge;

// Reshuffle: replace the least-competent minister with a fresh pick.
// Costs 20 PC, dampens cabinetCohesion for a moment, but lifts average
// competence. Use when cabinet drags implementation down.
export function reshuffleMinister(): void {
  const G = getState();
  if (G.politicalCapital < 20) return;
  if (G.cabinet.ministers.length === 0) return;
  G.politicalCapital -= 20;
  // Find lowest competence minister
  const sorted = [...G.cabinet.ministers].sort((a, b) => a.competence - b.competence);
  const victim = sorted[0];
  const idx = G.cabinet.ministers.findIndex(m => m.id === victim.id);
  if (idx < 0) return;
  // Replace with a fresh minister: better competence, lower corruption
  G.cabinet.ministers[idx] = {
    ...victim,
    competence: 6 + Math.floor(Math.random() * 3),
    corruption: Math.max(1, victim.corruption - 2),
  };
  G.cabinet.reshuffleCount++;
  G.cabinet.cabinetCohesion = Math.max(20, G.cabinet.cabinetCohesion - 10);
  G.stability = clamp(G.stability - 2);
  const wb = document.getElementById('warningBanner');
  if (wb) {
    wb.innerHTML = (wb.innerHTML ? wb.innerHTML + '<br>' : '') + `🔄 Výmena ministra: ${esc(victim.name)} odvolaný, kohézia kabinetu −10.`;
    wb.classList.add('show');
  }
  updateDash();
}

window.__reshuffleMinister = reshuffleMinister;

// Influence an institutional head (e.g., GP, SIS, NKU, RTVS). Costs 20 PC
// + raises capturedCount. Makes that institution more loyal but at the
// cost of institutional integrity + EU diplomatic relations. One-way
// action — use carefully.
export function influenceInstitution(instId: string): void {
  const G = getState();
  if (G.politicalCapital < 20) return;
  const head = G.institutions.heads.find(h => h.institution === instId);
  if (!head) return;
  if (head.loyalty >= 9) return;  // already maxed
  G.politicalCapital -= 20;
  head.loyalty = Math.min(10, head.loyalty + 2);
  head.conviction = Math.max(1, head.conviction - 1);
  G.institutions.institutionalIntegrity = Math.max(0, G.institutions.institutionalIntegrity - 5);
  G.diplo.eu = clamp((G.diplo.eu || 50) - 3);
  if (head.loyalty >= 8 && G.institutions.capturedCount < G.institutions.heads.length) {
    G.institutions.capturedCount++;
  }
  const wb = document.getElementById('warningBanner');
  if (wb) {
    wb.innerHTML = (wb.innerHTML ? wb.innerHTML + '<br>' : '') + `🏗️ ${esc(head.name)} ovplyvnený — lojalita rastie, integrita inštitúcií klesla.`;
    wb.classList.add('show');
  }
  updateDash();
}

window.__influenceInstitution = influenceInstitution;

export function proceed(a: AnalysisResult) {
  const G = getState();
  const era = getEra();

  trackAnalytics('month_played', { era: era.meta.id, month: G.month });

  // Policy consistency scoring runs on the previous month's policy so the
  // bonus/penalty modifies this month's delta before any further math.
  const lastPolicy = G.history.length ? G.history[G.history.length - 1].p : '';
  const { bonus, flipPenalty } = policyConsistency(G, lastPolicy);
  a.aD += bonus + flipPenalty;

  const capMult = politicalCapitalTick(G, lastPolicy.length);
  const eventTier = G.event?.tier || 'situation';
  const fatigueMult = crisisFatigueTick(G, eventTier);

  G.prevA = G.approval; G.prevS = G.stability; G.prevC = G.coalition; G.prevImpl = G.impl;
  const ir = ((a.cb.implementationRate || 80) / 100) * capMult;
  const mediaAmp = mediaCycleTick(G, eventTier, G.event?.headline || '');
  // Mood applied AFTER other modifiers. Note: 'crisis' amplifies negative
  // moves too — a bad policy during a crisis hurts harder. Intentional.
  const mood = moodMultiplier(G);
  G.approval = clamp(G.approval + applyMomentum(G, a.aD * ir * fatigueMult * mediaAmp * mood.approvalMult));
  G.stability = clamp(G.stability + a.stD * ir * mood.stabilityMult);
  G.coalition = clamp(G.coalition + a.cD * ir * mood.coalitionMult);
  G.impl = a.cb.implementationRate || G.impl;

  // Signature-law monthly modifiers: every adopted law contributes its
  // per-turn approval/stability/coalition/impl delta. Applied after the
  // main policy effects so the law can feel like a steady tail-wind
  // (or headwind) independent of the current event.
  for (const law of G.laws) {
    if (law.approvalMod) G.approval = clamp(G.approval + law.approvalMod);
    if (law.stabilityMod) G.stability = clamp(G.stability + law.stabilityMod);
    if (law.coalitionMod) G.coalition = clamp(G.coalition + law.coalitionMod);
    if (law.implMod) G.impl = clamp(G.impl + law.implMod, 20, 100);
  }

  blendScores(G.pScores, a.pScores);
  blendScores(G.sScores, a.sScores);

  socialInfluence(G, era);

  Object.entries(a.econFx).forEach(([k, d]) => { const ek = k as keyof EconomyState; if (ek in G.econ) G.econ[ek] += d * ir; });
  Object.entries(a.diploFx).forEach(([k, d]) => { if (G.diplo[k] !== undefined) G.diplo[k] = clamp(G.diplo[k] + d * ir); });
  if (a.diploFx.russia > 0) {
    if (G.diplo.eu !== undefined) G.diplo.eu -= a.diploFx.russia * .25;
    if (G.diplo.usa !== undefined) G.diplo.usa -= a.diploFx.russia * .2;
    if (G.diplo.ukraine !== undefined) G.diplo.ukraine -= a.diploFx.russia * .3;
    if (G.diplo.nato_r !== undefined) G.diplo.nato_r -= a.diploFx.russia * .2;
  }
  Object.keys(G.diplo).forEach(k => { G.diplo[k] = clamp(G.diplo[k]); });
  Object.entries(a.socialFx).forEach(([k, d]) => { if (G.social[k] !== undefined) G.social[k] = clamp(G.social[k] + d); });
  Object.assign(G.flags, a.flags);

  // Any consequence chain keyed off a flag we just set gets scheduled once,
  // gated by a _cc_<flag> marker so re-setting the flag can't re-trigger.
  // Chains whose fire month falls beyond the era's final month are skipped
  // — scheduling them at totalMonths-1 used to mean they got clamped onto
  // the last tick, then never fired because gameOver triggers before
  // displayEvent() on the final month.
  const chains = era.consequenceChains || [];
  for (const chain of chains) {
    if (G.flags[chain.flag] && !G.flags['_cc_' + chain.flag]) {
      G.flags['_cc_' + chain.flag] = true;
      const fireMonth = G.month + chain.delay;
      if (fireMonth >= era.totalMonths - 1) continue;
      G.cq.push({
        ev: chain.ev,
        fire: fireMonth,
        originP: G.history[G.history.length - 1]?.p || '',
        originM: G.month,
        prob: chain.prob
      });
    }
  }

  // Apply same diacritic-stripped normalisation as scoring.ts so that a
  // player typing "sociálna" or "sociálna" or "socialna" or "SOCIÁLNA"
  // all trigger the same stance drift. Keyword list is canonical ASCII.
  const lastPol = G.history.length ? normalizeText(G.history[G.history.length - 1].p) : '';
  const stanceLabels: Record<string, string> = { ekonomika: 'Ekonomika', eu: 'EÚ/NATO', rusko: 'Rusko', social: 'Sociálna', media: 'Média', justicia: 'Justícia', migracia: 'Migrácia', identita: 'Identita' };
  const stanceChanges: string[] = [];
  if (lastPol) {
    const prevStances = { ...G.stances };
    const stMap = [
      { kws: ['eu', 'nato', 'brusel', 'europ'], k: 'eu', d: 1 }, { kws: ['sovereign', 'suverenita', 'suveren'], k: 'eu', d: -1 },
      { kws: ['sovereign', 'suverenita', 'narodn', 'tradici'], k: 'identita', d: 1 },
      { kws: ['russia', 'rusko', 'moskva'], k: 'rusko', d: 1 }, { kws: ['social', 'pension', 'dochodok', 'dochod', 'socialn'], k: 'social', d: 1 },
      { kws: ['tax', 'dan', 'konsolidaci'], k: 'ekonomika', d: -1 }, { kws: ['invest', 'startup', 'biznis', 'podnik'], k: 'ekonomika', d: 1 },
      { kws: ['media', 'rtvs', 'stvr', 'tlac'], k: 'media', d: -1 }, { kws: ['transparentnost', 'slobod'], k: 'media', d: 1 },
      { kws: ['sud', 'justici', 'pravny stat'], k: 'justicia', d: 1 }, { kws: ['kontrolovat sud', 'ovladnut'], k: 'justicia', d: -1 },
      { kws: ['migraci', 'migrant', 'azyl', 'utecen'], k: 'migracia', d: -1 }, { kws: ['kvoty', 'solidarit'], k: 'migracia', d: 1 },
      { kws: ['ukraine', 'ukrajin'], k: 'eu', d: 1 }, { kws: ['mier', 'peace', 'neutralit'], k: 'rusko', d: 1 },
    ];
    stMap.forEach(m => { if (m.kws.some(k => lastPol.includes(k))) { G.stances[m.k] = Math.max(-5, Math.min(5, (G.stances[m.k] || 0) + m.d)); } });
    Object.entries(G.stances).forEach(([k, v]) => {
      const d = v - (prevStances[k] || 0);
      if (d !== 0) stanceChanges.push(`${stanceLabels[k] || k} ${d > 0 ? '→ doprava' : '→ doľava'}`);
    });
  }
  const stanceEl = document.getElementById('stanceNotification');
  if (stanceEl) {
    if (stanceChanges.length) { stanceEl.textContent = '🧭 ' + stanceChanges.join(' | '); stanceEl.style.display = 'block'; }
    else stanceEl.style.display = 'none';
  }

  if (a.consequence) {
    const fireMonth = G.month + (a.consequence.delay || 3);
    if (fireMonth < era.totalMonths - 1) {
      G.cq.push({
        // `c` (context) + `s` (suggestions) are intentionally left for the
        // event-rendering fallbacks in events.ts::getEvent to fill in —
        // that keeps the event card from rendering blank when the
        // analysis layer didn't author full narrative copy.
        ev: {
          h: a.consequence.headline,
          d: a.consequence.description,
          c: 'Dôsledky starších politík dozrievajú. Čo urobíte?',
          cat: 'Ekonomika',
          s: ['Prevziať zodpovednosť', 'Nájsť vinníka', 'Presmerovať pozornosť'],
        },
        fire: fireMonth, originP: G.history[G.history.length - 1]?.p || '', originM: G.month, prob: a.consequence.probability || .5
      });
    }
  }

  // Blend p.sat toward the stakeholder score so it trends with the coalition
  // mood, but preserve in-turn events (concessions from handleDem, satisfaction
  // hits from refused demands, plot recoveries). Previous version overwrote
  // p.sat outright every turn, which erased those events entirely — making the
  // coalition-deal buttons and the plot mechanic feel broken.
  Object.entries(G.cp).forEach(([id, p]) => {
    if (!p.on) return;
    const target = G.sScores[id] || 50;
    // 40% weight on the new target, 60% on the current (in-turn adjusted) sat
    p.sat = Math.max(0, Math.min(100, p.sat * 0.6 + target * 0.4));
  });

  businessCycleTick(G);
  // GDP grown from the monthly growth rate: (1 + annual%/100)/12 ≈ /1200.
  G.econ.gdp = Math.max(1, G.econ.gdp * (1 + G.econ.gdpGrowth / 1200));
  deficitDynamics(G);
  G.econ.debt = Math.max(0, G.econ.debt + G.econ.deficit / 12);
  euFundsLink(G);
  smartMinWage(G);
  clampEcon(G);
  econFeedback(G);
  diploFeedback(G);
  incumbencyPenalty(G);
  // Crisis message is held until after updateDash so it isn't overwritten.
  const crisisMsg = econCrisisCheck(G);

  okunsLaw(G);
  fdiDynamics(G);
  fiscalHealth(G);
  laborMarketTick(G);
  brainDrainTick(G);
  oligarchicTick(G);
  mediaEcosystemTick(G);

  courtTick(G, era);
  const { scandal: ministerScandal } = cabinetTick(G, era);
  institutionsTick(G, era);

  const courtInfluence = courtIdeologyScore(G);
  if (G.court.judges.length > 0) {
    G.impl = clamp(G.impl + (courtInfluence - 50) * 0.05, 20, 100);
  }

  const lastPolicyText = G.history.length ? G.history[G.history.length - 1].p : '';
  const cabinetMod = cabinetImplementationMod(G, lastPolicyText, era);
  G.impl = clamp(G.impl * cabinetMod, 20, 100);
  updatePolling(G);

  if (G.pollApproval < 25) {
    G.oppositionPressure = Math.min(100, G.oppositionPressure + 3);
  } else if (G.pollApproval > 50) {
    G.oppositionPressure = Math.max(0, G.oppositionPressure - 2);
  }

  // Sustained sub-20% polls after the honeymoon period (6 months) start
  // drawing down stability as snap-election pressure mounts.
  const pollWarning = (G.pollApproval < 20 && G.month > 6) ? '📉 Prieskumy pod 20% — tlak na predčasné voľby rastie!' : null;
  if (pollWarning) G.stability = Math.max(0, G.stability - 1.5);

  computeShapley(G, era);

  if (era.meta.pellegriniMonth >= 0 && G.month === era.meta.pellegriniMonth) G.pellegrini = true;
  if (era.meta.presidentUnfriendlyMonth !== undefined && era.meta.presidentUnfriendlyMonth >= 0 && G.month === era.meta.presidentUnfriendlyMonth) {
    G.pellegrini = false;
  }

  const oppAction = oppositionMove(G, era);
  if (oppAction.action) {
    G.approval = clamp(G.approval + oppAction.effect.approval);
    G.stability = clamp(G.stability + oppAction.effect.stability);
    G.coalition = clamp(G.coalition + oppAction.effect.coalition);
  }
  const oppEl = document.getElementById('oppositionAction');
  if (oppEl) {
    if (oppAction.action) { oppEl.textContent = oppAction.action; oppEl.style.display = 'block'; }
    else oppEl.style.display = 'none';
  }

  G.approval = clamp(G.approval);
  G.stability = clamp(G.stability);
  G.coalition = clamp(G.coalition);
  clampEcon(G);

  G.approvalH.push(G.approval);
  G.month++;
  nashBargaining(G, era);
  updateMood(G);
  const plotMessage = updateCoalitionPlots(G);
  const demandMessages = updateStakeholderDemands(G, era);
  // Resolve demands the player may have just addressed: if their policy's
  // event topic matched a published demand's stakeholder, give the
  // stakeholder a satisfaction boost and clear the demand. (Crude but
  // matches the existing topic-tagging machinery without new state.)
  const eventTopic = G.event?.category;
  if (eventTopic) {
    for (const [sid, _dem] of Object.entries(G.stakeholderDemands)) {
      // If sScore moved up by ≥3 this turn, treat the demand as addressed
      const before = G.sScores[sid] || 50;
      const after = a.sScores[sid] || 50;
      if (after - before >= 3) {
        G.sScores[sid] = Math.min(95, before + 8);
        delete G.stakeholderDemands[sid];
        demandMessages.push(`✅ ${sid.toUpperCase()}: požiadavka splnená — vďačnosť +8.`);
      }
    }
  }

  try {
    const sv = JSON.parse(JSON.stringify(G)) as Omit<GameState, 'used'> & { used: string[] };
    sv.used = Array.from(G.used);
    localStorage.setItem(era.meta.saveKey, JSON.stringify(sv));
  } catch (_e) { /* ignore */ }

  if (G.approval < era.gameOverThreshold || G.stability < era.gameOverThreshold || G.coalition < era.gameOverThreshold) {
    gameOver(true);
  } else if (G.month >= era.totalMonths) {
    gameOver(false);
  } else {
    updateDash();
    const wb = document.getElementById('warningBanner');
    if (wb) {
      const extras: string[] = [];
      if (crisisMsg) extras.push(crisisMsg);
      if (pollWarning) extras.push(pollWarning);
      if (ministerScandal) extras.push('🔥 ' + ministerScandal);
      if (G.court.pendingVacancies > 0) extras.push('🏛️ Ústavný súd: ' + G.court.pendingVacancies + ' voľné miesta');
      if (G.institutions.capturedCount >= 4) extras.push('⚠️ EÚ varuje pred úpadkom inštitúcií');
      if (plotMessage) extras.push(plotMessage);
      for (const m of demandMessages) extras.push(m);
      if (extras.length) {
        const existing = wb.innerHTML;
        wb.innerHTML = (existing ? existing + '<br>' : '') + extras.join('<br>');
        wb.classList.add('show');
      }
    }
    showScreen('dashboardScreen');
  }
}

function gameOver(collapsed: boolean) {
  const G = getState();
  const era = getEra();
  let title = '', narr = '';

  if (collapsed) {
    const reasons: string[] = [];
    if (G.approval < era.gameOverThreshold) reasons.push('Verejnosť stratila dôveru. Masívne protesty.');
    if (G.stability < era.gameOverThreshold) reasons.push('Kabinet sa rozpadol. Ministri rezignujú.');
    if (G.coalition < era.gameOverThreshold) reasons.push('Koaliční partneri opustili vládu.');
    if (reasons.length >= 3) { title = 'Totálny kolaps'; }
    else if (reasons.length >= 2) { title = 'Kolaps vlády na viacerých frontoch'; }
    else if (G.approval < era.gameOverThreshold) { title = 'Kolaps podpory'; }
    else if (G.stability < era.gameOverThreshold) { title = 'Kolaps vlády'; }
    else { title = 'Rozpad koalície'; }
    narr = reasons.join(' ') + ' Ste nútený rezignovať.';
  } else {
    const avg = (G.approval + G.stability + G.coalition) / 3;
    if (avg >= 65) { title = 'Triumfálne obdobie'; narr = '4 roky zanechali stopu. Konsolidovali ste moc a previedli Slovensko turbulentným obdobím.'; }
    else if (avg >= 50) { title = 'Úspešné obdobie'; narr = 'Prežili ste obdobie s viacerými úspechmi. Slovensko je stabilnejšie.'; }
    else if (avg >= 35) { title = 'Prežitie za cenu'; narr = 'Dotiahli ste to do konca, no nie bez jaziev. Polarizácia je na maxime.'; }
    else { title = 'Vlečúca sa vláda'; narr = 'Obdobie za vami, ale vláda sa len vliekla. Podpora slabá, koalícia rozháraná.'; }
    // Ending modifiers previously overwrote title + narr in sequence, so
    // a game that matched multiple conditions (authoritarian AND EU-isolated
    // AND national-unity) showed only the LAST matched string. Now we
    // collect modifiers and append them as a secondary narrative — the
    // base title stays tied to the averaged scores, and the character of
    // the era reads as a list of defining traits.
    const traits: string[] = [];
    if (G.social.press < 30 && G.approval > 50) traits.push('autoritárska konsolidácia — oslabené demokratické inštitúcie');
    if (G.diplo.eu < 20) traits.push('izolácia od EÚ — fondy zmrazené');
    if (G.flags.national_unity) traits.push('národná jednota — po tragédii ste zvolili cestu zmierenia');
    if (G.institutions.capturedCount >= 4) traits.push('inštitucionálny prelom — 4+ ovládnutých inštitúcií');
    if (G.oligarchicTies >= 60) traits.push('prepojenie s oligarchami — tajné dohody vás vyniesli aj zaťažili');
    if (G.brainDrain >= 60) traits.push('odliv talentov — mladí odchádzajú zo Slovenska');
    if (traits.length) {
      narr += ' Charakter obdobia: ' + traits.join('; ') + '.';
    }
  }

  const el = (id: string) => document.getElementById(id)!;
  el('gameOverTitle').textContent = title;
  el('gameOverNarrative').textContent = narr;
  el('gameOverStats').innerHTML = [
    { l: 'Podpora', v: Math.round(G.approval) + '%' }, { l: 'Stabilita', v: Math.round(G.stability) + '%' },
    { l: 'Koalícia', v: Math.round(G.coalition) + '%' }, { l: 'Mesiace', v: String(G.month) },
    { l: 'HDP', v: G.econ.gdp.toFixed(1) + ' ' + (era.meta.currencyBig || 'mld €') }, { l: 'Rast HDP', v: G.econ.gdpGrowth.toFixed(1) + '%' },
    { l: 'Inflácia', v: G.econ.infl.toFixed(1) + '%' }, { l: 'Dlh', v: G.econ.debt.toFixed(1) + ' ' + (era.meta.currencyBig || 'mld €') },
  ].map(s => `<div class="game-over-stat"><div class="game-over-stat-label">${s.l}</div><div class="game-over-stat-value">${s.v}</div></div>`).join('');

  const rcEl = document.getElementById('realComparisonSection');
  if (rcEl) {
    const rc = era.meta.realComparison;
    if (rc) {
      const lastedReal = rc.lasted.value > 0 ? rc.lasted.value : era.totalMonths;
      const rows: Array<{ label: string; player: string; real: string; better: boolean | null }> = [
        {
          label: 'Podpora',
          player: Math.round(G.approval) + '%',
          real: rc.approval.value + '%',
          better: G.approval > rc.approval.value ? true : G.approval < rc.approval.value ? false : null,
        },
        {
          label: 'Rast HDP',
          player: G.econ.gdpGrowth.toFixed(1) + '%',
          real: rc.gdpGrowth.value + '%',
          better: G.econ.gdpGrowth > rc.gdpGrowth.value ? true : G.econ.gdpGrowth < rc.gdpGrowth.value ? false : null,
        },
        {
          label: 'Nezamestnanosť',
          player: G.econ.unemp.toFixed(1) + '%',
          real: rc.unemployment.value + '%',
          // lower is better for unemployment
          better: G.econ.unemp < rc.unemployment.value ? true : G.econ.unemp > rc.unemployment.value ? false : null,
        },
        {
          label: 'Inflácia',
          player: G.econ.infl.toFixed(1) + '%',
          real: rc.inflation.value + '%',
          // lower is better for inflation
          better: G.econ.infl < rc.inflation.value ? true : G.econ.infl > rc.inflation.value ? false : null,
        },
        {
          label: 'Mesiace vo funkcii',
          player: String(G.month),
          real: lastedReal > 0 ? String(lastedReal) : 'prebieha',
          better: G.month >= lastedReal ? true : G.month < lastedReal ? false : null,
        },
      ];
      const rowsHtml = rows.map(r => {
        const playerCol = r.better === true ? 'var(--green)' : r.better === false ? 'var(--red)' : '#fff';
        const badge = r.better === true ? '▲' : r.better === false ? '▼' : '=';
        return `<tr>
          <td style="padding:6px 10px;color:var(--text-dim);font-size:.8rem">${esc(r.label)}</td>
          <td style="padding:6px 10px;text-align:center;font-family:var(--mono);font-size:.85rem;color:${playerCol};font-weight:600">${esc(r.player)} <span style="font-size:.65rem">${badge}</span></td>
          <td style="padding:6px 10px;text-align:center;font-family:var(--mono);font-size:.85rem;color:var(--text-dim)">${esc(r.real)}</td>
        </tr>`;
      }).join('');
      rcEl.innerHTML = `<div class="dashboard-panel" style="margin-top:16px">
        <div class="panel-title">🏛️ Porovnanie s realitou</div>
        <table style="width:100%;border-collapse:collapse;margin:12px 0">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,.1)">
              <th style="padding:6px 10px;text-align:left;font-size:.75rem;color:var(--text-dim);font-weight:500">Ukazovateľ</th>
              <th style="padding:6px 10px;text-align:center;font-size:.75rem;color:var(--gold);font-weight:500">Vy</th>
              <th style="padding:6px 10px;text-align:center;font-size:.75rem;color:var(--text-dim);font-weight:500">Realita</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="margin-top:10px;padding:10px 12px;background:rgba(255,255,255,.04);border-radius:6px;border-left:3px solid var(--gold)">
          <div style="font-size:.7rem;color:var(--gold);font-weight:600;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Ako to v realite dopadlo</div>
          <p style="font-size:.85rem;color:var(--text-dim);margin:0;line-height:1.5">${esc(rc.verdict)}</p>
        </div>
        <div style="font-size:.65rem;color:var(--text-dim);margin-top:8px;text-align:center">▲ lepšie ako realita &nbsp;|&nbsp; ▼ horšie ako realita</div>
      </div>`;
    } else {
      rcEl.innerHTML = '';
    }
  }

  el('approvalChart').innerHTML = renderApprovalChart(G);

  if (!collapsed) {
    const election = simulateElection(G, era);
    const electionEl = document.getElementById('electionResults');
    if (electionEl) {
      const partyNames = era.partyDisplay.names;
      const partyColors = era.partyDisplay.colors;
      const sortedParties = Object.entries(election.seats).sort(([, a], [, b]) => b.mean - a.mean);
      const bars = sortedParties.map(([party, s]) =>
        `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
          <span style="min-width:60px;font-size:.75rem;color:var(--text-dim)">${esc(partyNames[party] || party)}</span>
          <div style="flex:1;height:16px;background:rgba(255,255,255,.05);border-radius:3px;position:relative;overflow:hidden">
            <div style="position:absolute;left:${(s.low/150)*100}%;width:${((s.high-s.low)/150)*100}%;height:100%;background:${partyColors[party] || '#4a5568'};opacity:.3;border-radius:3px"></div>
            <div style="position:absolute;left:0;width:${(s.mean/150)*100}%;height:100%;background:${partyColors[party] || '#4a5568'};border-radius:3px"></div>
          </div>
          <span style="min-width:70px;font-family:var(--mono);font-size:.75rem;color:#fff;text-align:right">${s.mean} <span style="color:var(--text-dim)">(${s.low}-${s.high})</span></span>
        </div>`
      ).join('');
      const winPct = Math.round(election.winProbability * 100);
      const winCol = winPct > 60 ? 'var(--green)' : winPct > 40 ? 'var(--yellow)' : 'var(--red)';
      electionEl.innerHTML = `<div class="dashboard-panel" style="margin-top:16px">
        <div class="panel-title">🗳️ Simulácia volieb (Monte Carlo, ${500} iterácií)</div>
        <p style="color:var(--text-dim);font-size:.85rem;margin:8px 0">${esc(election.narrative)}</p>
        <div style="text-align:center;margin:8px 0"><span style="font-size:1.4rem;font-weight:700;color:${winCol}">${winPct}%</span> <span style="color:var(--text-dim);font-size:.8rem">šanca na väčšinu koalície</span></div>
        ${bars}
        <div style="font-size:.65rem;color:var(--text-dim);margin-top:8px;text-align:center">Stĺpce: priemer ± 90% interval spoľahlivosti | D'Hondt metóda | 5% klauzula</div>
      </div>`;
    }
  }

  trackAnalytics(collapsed ? 'game_over' : 'game_complete', { era: era.meta.id, month: G.month, approval: G.approval, stability: G.stability, coalition: G.coalition });
  localStorage.removeItem(era.meta.saveKey);

  const shareData = btoa(JSON.stringify({
    e: era.meta.id,
    p: era.meta.pmName,
    m: G.month,
    a: Math.round(G.approval),
    s: Math.round(G.stability),
    c: Math.round(G.coalition),
    g: G.econ.gdpGrowth.toFixed(1),
    w: collapsed ? 0 : 1
  }));
  const shareUrl = window.location.origin + window.location.pathname + '?result=' + shareData;
  window.__shareUrl = shareUrl;

  try {
    const lb: LeaderboardEntry[] = JSON.parse(localStorage.getItem('spm_leaderboard') || '[]');
    lb.push({ era: era.meta.id, pm: era.meta.pmName, approval: Math.round(G.approval), stability: Math.round(G.stability), months: G.month, won: !collapsed, date: new Date().toISOString().substring(0,10) });
    lb.sort((a, b) => b.approval - a.approval);
    if (lb.length > 50) lb.length = 50;
    localStorage.setItem('spm_leaderboard', JSON.stringify(lb));
  } catch {}

  showScreen('gameOverScreen');
}

export function confirmResign() {
  const G = getState();
  const era = getEra();
  document.getElementById('resignModal')!.classList.remove('active');
  const el = (id: string) => document.getElementById(id)!;
  el('gameOverTitle').textContent = 'Rezignácia predsedu vlády';
  el('gameOverNarrative').textContent = `${era.meta.pmName} oznámil svoju rezignáciu z funkcie predsedu vlády Slovenskej republiky.`;
  el('gameOverStats').innerHTML = [
    { l: 'Podpora', v: Math.round(G.approval) + '%' }, { l: 'Stabilita', v: Math.round(G.stability) + '%' },
    { l: 'Koalícia', v: Math.round(G.coalition) + '%' }, { l: 'Mesiace', v: String(G.month) },
    { l: 'Dôvod', v: 'Rezignácia' },
  ].map(s => `<div class="game-over-stat"><div class="game-over-stat-label">${s.l}</div><div class="game-over-stat-value">${s.v}</div></div>`).join('');
  el('approvalChart').innerHTML = renderApprovalChart(G);
  const rcEl = document.getElementById('realComparisonSection');
  if (rcEl) rcEl.innerHTML = '';
  const erEl = document.getElementById('electionResults');
  if (erEl) erEl.innerHTML = '';
  localStorage.removeItem(era.meta.saveKey);
  showScreen('gameOverScreen');
}

// Exposed on window so inline onclick handlers in generated HTML can call them.
window.__doKick = doKick;
window.__closeModal = closeModal;
window.__handleDem = handleDem;
window.__kickP = kickP;
