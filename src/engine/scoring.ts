import type { ActiveEvent, AnalysisResult, EraConfig } from './types';
import { getEra, getState, coalitionSeats } from './state';

function generateHeadlines(policy: string, ev: ActiveEvent | null): AnalysisResult['press'] {
  const era = getEra();
  const low = policy.toLowerCase();
  const topic = ev ? (ev.headline || '') : '';

  function pickHeadline(entries: EraConfig['headlines']['left']['entries'], fallbackH: string, fallbackS: string) {
    for (const item of entries) {
      if (item.kw.some(k => low.includes(k))) return { headline: item.h.replace('{topic}', topic), subhead: item.sub };
    }
    return { headline: fallbackH, subhead: fallbackS };
  }

  const hl = era.headlines;
  return {
    left: pickHeadline(hl.left.entries,
      hl.left.fallback?.headline || 'Vláda opäť prekvapuje — ale nie v dobrom',
      hl.left.fallback?.subhead || 'Analytici z viacerých think-tankov hodnotia najnovšie kroky vlády kriticky.'),
    center: pickHeadline(hl.center.entries,
      hl.center.fallback?.headline || 'Vláda prijala nové opatrenia',
      hl.center.fallback?.subhead || 'Reakcie sú zmiešané, dopady sa ukážu v nasledujúcich mesiacoch.'),
    right: pickHeadline(hl.right.entries,
      hl.right.fallback?.headline || 'Silné rozhodnutie vlády v prospech Slovenska',
      hl.right.fallback?.subhead || 'Opozícia opäť kritizuje, ale občania sú spokojní.'),
  };
}

export function kwScore(policy: string): AnalysisResult {
  const era = getEra();
  const G = getState();
  const low = policy.toLowerCase();

  const a: AnalysisResult = {
    pScores: {}, sScores: {},
    econFx: { gdp: 0, gdpGrowth: 0, unemp: 0, infl: 0, deficit: 0, debt: 0 },
    diploFx: {},
    aD: 0, stD: 0, cD: 0,
    cs: {
      summary: 'Politika analyzovaná lokálnym systémom.',
      risk: 'Medium', treasuryCost: 'Medium', growthPotential: 'Medium',
      complexity: 'Medium', publicSensitivity: 'Medium',
      recommendation: 'Monitorujte implementáciu.',
    },
    press: generateHeadlines(policy, G.event),
    cb: {
      parliament: 70, court: 80,
      president: G.pellegrini ? 90 : 50,
      implementationRate: 80,
      reasons: { parliament: '', court: '', president: '' },
    },
    consequence: null, flags: {}, socialFx: { press: 0, corrupt: 0 },
  };

  era.personas.forEach(p => { a.pScores[p.id] = G.pScores[p.id] || 50; });
  era.stakeholders.forEach(s => { a.sScores[s.id] = G.sScores[s.id] || 50; });
  era.diplomacy.forEach(d => { a.diploFx[d.key] = 0; });

  // Apply keyword effects
  Object.entries(era.keywords).forEach(([kw, fx]) => {
    if (low.includes(kw)) {
      if (fx.p) Object.entries(fx.p).forEach(([pid, d]) => { a.pScores[pid] = (a.pScores[pid] || 50) + d; });
      if (fx.s) Object.entries(fx.s).forEach(([sid, d]) => { a.sScores[sid] = (a.sScores[sid] || 50) + d; });
      if (fx.dp) Object.entries(fx.dp).forEach(([k, d]) => { a.diploFx[k] = (a.diploFx[k] || 0) + d; });
      if (fx.e) Object.entries(fx.e).forEach(([k, d]) => { if (a.econFx[k] !== undefined) a.econFx[k] += d; });
    }
  });

  // FDI-sensitive keywords
  const fdiPositive = ['investícia', 'invest', 'priemysel', 'fabrika', 'automobilka', 'startup', 'inovácia', 'výskum'];
  const fdiNegative = ['znárodniť', 'znárodnenie', 'regulácia', 'zákaz', 'protekcionizmus'];
  if (fdiPositive.some(k => low.includes(k))) {
    a.econFx.gdpGrowth = (a.econFx.gdpGrowth || 0) + 0.2;
  }
  if (fdiNegative.some(k => low.includes(k))) {
    a.econFx.gdpGrowth = (a.econFx.gdpGrowth || 0) - 0.3;
  }

  // Clamp persona/stakeholder scores
  Object.keys(a.pScores).forEach(id => { a.pScores[id] = Math.max(5, Math.min(95, a.pScores[id])); });
  Object.keys(a.sScores).forEach(id => { a.sScores[id] = Math.max(5, Math.min(95, a.sScores[id])); });

  // Calculate deltas
  const avg = era.personas.length ? Object.values(a.pScores).reduce((x, y) => x + y, 0) / era.personas.length : 50;
  a.aD = Math.round((avg - 50) * 0.3);
  // Checks & Balances
  const cs = coalitionSeats();
  const isConstitutional = low.includes('ústav') || low.includes('constitution') || low.includes('zmena zákon');
  const requiredSeats = isConstitutional ? 90 : 76;
  if (cs >= requiredSeats) { a.cb.parliament = 65 + Math.round(Math.random() * 25); }
  else if (cs >= 76 && isConstitutional) { a.cb.parliament = 15 + Math.round(Math.random() * 20); }
  else if (cs >= 70) { a.cb.parliament = 30 + Math.round(Math.random() * 25); }
  else { a.cb.parliament = 10 + Math.round(Math.random() * 20); }

  const crazyKw = ['zavri', 'zakáz', 'zakaz', 'zruš opozíc', 'zrus opozic', 'diktát', 'diktat', 'cenzúr', 'cenzur', 'zatkn', 'umlč', 'umlc', 'rozpust parlament', 'zastav voľb', 'zastav volb', 'odvola sudc', 'odvola súdc'];
  const antiDemoKw = ['zruš ústavn', 'zrus ustavn', 'ovládn médi', 'ovladn medi', 'kontrolova súd', 'kontrolova sud', 'potlač protest', 'potlac protest'];
  const isCrazy = crazyKw.some(k => low.includes(k));
  const isAntiDemo = antiDemoKw.some(k => low.includes(k));

  if (isCrazy || isAntiDemo) {
    a.cb.court = 5 + Math.round(Math.random() * 15);
    a.cb.president = G.pellegrini ? 30 + Math.round(Math.random() * 20) : 5 + Math.round(Math.random() * 10);
    if (a.sScores.judiciary !== undefined) a.sScores.judiciary = Math.max(5, (a.sScores.judiciary || 50) - 20);
    if (a.sScores.eu_nato !== undefined) a.sScores.eu_nato = Math.max(5, (a.sScores.eu_nato || 50) - 15);
    if (a.sScores.media_ind !== undefined) a.sScores.media_ind = Math.max(5, (a.sScores.media_ind || 50) - 15);
    if (a.sScores.ps !== undefined) a.sScores.ps = Math.max(5, (a.sScores.ps || 50) - 15);
    a.diploFx.eu = (a.diploFx.eu || 0) - 5;
    a.diploFx.usa = (a.diploFx.usa || 0) - 3;
  } else {
    a.cb.court = 60 + Math.round(Math.random() * 30);
    a.cb.president = G.pellegrini ? 75 + Math.round(Math.random() * 20) : 40 + Math.round(Math.random() * 30);
  }

  a.cb.implementationRate = Math.max(5, Math.min(95, Math.round(a.cb.parliament * 0.4 + a.cb.court * 0.3 + a.cb.president * 0.3)));

  // Stability: derived from policy coherence and checks & balances
  const stBase = (a.cb.parliament > 60 ? 2 : -2) + (a.cb.court > 50 ? 1 : -1);
  a.stD = Math.round(stBase + (Math.random() * 4 - 2));

  // Coalition: derived from stakeholder alignment with coalition partners
  const cpIds = era.coalitionPartners.map(cp => cp.id);
  const cpAvg = cpIds.reduce((sum, id) => sum + (a.sScores[id] || 50), 0) / Math.max(1, cpIds.length);
  a.cD = Math.round((cpAvg - 50) * 0.2 + (Math.random() * 2 - 1));

  // C&B reasons
  if (!a.cb.reasons) a.cb.reasons = {};
  const snsKw = low.includes('suverenita') || low.includes('sovereign') || low.includes('národn');
  if (cs >= 76 && !isConstitutional) a.cb.reasons.parliament = 'Koaličná väčšina (' + cs + '/150) zabezpečuje schválenie.';
  else if (cs >= 76 && isConstitutional) a.cb.reasons.parliament = 'Ústavná zmena vyžaduje 90 hlasov. Koalícia má len ' + cs + '.';
  else if (cs >= 70) a.cb.reasons.parliament = 'Menšinová vláda (' + cs + '/150) — opozícia môže blokovať.';
  else a.cb.reasons.parliament = 'Slabá menšinová vláda (' + cs + '/150). Vysoké riziko neúspechu.';
  if (snsKw) a.cb.reasons.parliament += ' SNS nadšene podporuje.';

  if (isCrazy || isAntiDemo) a.cb.reasons.court = 'Ústavný súd pravdepodobne zablokuje — rozpor s ústavnými právami.';
  else if (low.includes('zákon') || low.includes('novel')) a.cb.reasons.court = 'Ústavný súd preskúma zákonnosť, ale nemá zásadné námietky.';
  else a.cb.reasons.court = 'Ústavný súd nemá námietky.';

  const friendlyPres = era.meta.presidentFriendly || 'koaličný prezident';
  const defaultPres = era.meta.presidentName || 'Prezident';
  if (G.pellegrini) a.cb.reasons.president = `Prezident ${friendlyPres} pravdepodobne podpíše — koaličný spojenec.` + (isCrazy ? ' Aj on však môže váhať.' : '');
  else a.cb.reasons.president = `Prezident ${defaultPres} môže vetovať — opozičný postoj.` + (isCrazy ? ' Takmer určite vetuje.' : '');

  if (a.cb.implementationRate < 30) {
    a.aD = Math.round(a.aD * 0.3);
    a.stD = Math.min(a.stD, -3);
    a.cD = Math.min(a.cD, -2);
  }

  // Flag detection
  const ev = G.event;
  if (ev) {
    if (ev.id === 'criminal_code' && (low.includes('pretlačiť') || low.includes('rýchlo') || low.includes('push'))) a.flags.criminal_aggressive = true;
    if (ev.id === 'ukraine_aid' && (low.includes('ukončiť') || low.includes('zastaviť') || low.includes('stop'))) a.flags.ukraine_stopped = true;
    if (ev.id === 'rtvs' && (low.includes('pretlačiť') || low.includes('push'))) a.flags.rtvs_aggressive = true;
    if (ev.id === 'healthcare' && (low.includes('núdzov') || low.includes('500'))) a.flags.healthcare_emergency = true;
    if (ev.id === 'assassination' && (low.includes('jednot') || low.includes('zmieren') || low.includes('unity'))) a.flags.national_unity = true;
    // Positive outcome flags
    if (ev.id === 'healthcare' && (low.includes('invest') || low.includes('plat') || low.includes('reforma'))) a.flags.healthcare_reform = true;
    if (ev.id === 'eu_funds' && (low.includes('transparentn') || low.includes('reform') || low.includes('kontrola'))) a.flags.eu_funds_success = true;
    if (ev.id === 'consolidation' && (low.includes('úspor') || low.includes('efektív') || low.includes('škrt'))) a.flags.fiscal_discipline = true;
  }

  return a;
}
