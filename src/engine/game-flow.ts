import type { AnalysisResult } from './types';
import { getEra, getState, getCalendarDate } from './state';
import { showScreen } from './screen';
import { updateDash } from './render/dashboard';
import { esc } from './sanitize';
import { trackAnalytics } from './analytics';
import { applyMomentum, socialInfluence, econFeedback, policyConsistency, oppositionMove, nashBargaining, simulateElection, businessCycleTick, deficitDynamics, euFundsLink, smartMinWage, econCrisisCheck, incumbencyPenalty, crisisFatigueTick, politicalCapitalTick, diploFeedback, computeShapley, fiscalHealth, fdiDynamics, okunsLaw, mediaCycleTick, updatePolling, laborMarketTick } from './advanced';

export function handleDem(id: string, action: string) {
  const G = getState();
  const p = G.cp[id];
  if (!p || !p.dem) return;
  if (action === 'c') { p.sat = Math.min(100, p.sat + 15); p.pat = Math.min(100, p.pat + 10); G.coalition = Math.min(100, G.coalition + 5); Object.entries(G.cp).forEach(([oid, op]) => { if (oid !== id && op.on) op.sat = Math.max(0, op.sat - 5); }); }
  else if (action === 'n') { p.sat = Math.min(100, p.sat + 5); p.pat = Math.min(100, p.pat + 5); }
  else { p.sat = Math.max(0, p.sat - 15); p.pat = Math.max(0, p.pat - 10); G.coalition = Math.max(0, G.coalition - 5); }
  p.dem = null;
  updateDash();
}

export function kickP(id: string) {
  const era = getEra();
  const cp = era.coalitionPartners.find(x => x.id === id);
  if (!cp) return;
  if (id === era.coalitionPartners[0]?.id) return; // Can't kick your own party
  const el = (eid: string) => document.getElementById(eid)!;
  el('modalTitle').textContent = 'Vyhodiť ' + cp.name + '?';
  el('modalText').textContent = 'Stratíte ' + cp.seats + ' kresiel. Stabilita výrazne klesne.';
  el('modalActions').innerHTML = `<button class="partner-btn kick" onclick="window.__doKick('${esc(id)}');window.__closeModal()">Potvrdiť</button><button class="partner-btn negotiate" onclick="window.__closeModal()">Zrušiť</button>`;
  document.getElementById('coalitionModal')!.classList.add('active');
}

export function doKick(id: string) {
  const G = getState();
  G.cp[id].on = 0;
  G.cp[id].sat = 10;
  G.sScores[id] = 10;
  G.stability = Math.max(0, G.stability - 25);
  G.coalition = Math.max(0, G.coalition - 15);
  G.flags[id + '_kicked'] = true;
  updateDash();
}

export function closeModal() {
  document.getElementById('coalitionModal')!.classList.remove('active');
}

export function proceed(a: AnalysisResult) {
  const G = getState();
  const era = getEra();

  trackAnalytics('month_played', { era: era.meta.id, month: G.month });

  // Policy consistency scoring (before applying deltas)
  const lastPolicy = G.history.length ? G.history[G.history.length - 1].p : '';
  const { bonus, flipPenalty } = policyConsistency(G, lastPolicy);
  a.aD += bonus + flipPenalty;

  // Political capital — ambitious policies cost capital, low capital reduces effectiveness
  const capMult = politicalCapitalTick(G, lastPolicy.length);

  // Crisis fatigue — constant crises numb the public
  const eventTier = G.event?.tier || 'situation';
  const fatigueMult = crisisFatigueTick(G, eventTier);

  G.prevA = G.approval; G.prevS = G.stability; G.prevC = G.coalition; G.prevImpl = G.impl;
  const ir = ((a.cb?.implementationRate || 80) / 100) * capMult;
  // Apply approval with momentum, volatility, and fatigue dampening
  const mediaAmp = mediaCycleTick(G, eventTier, G.event?.headline || '');
  G.approval = Math.max(0, Math.min(100, G.approval + applyMomentum(G, a.aD * ir * fatigueMult * mediaAmp)));
  G.stability = Math.max(0, Math.min(100, G.stability + a.stD * ir));
  G.coalition = Math.max(0, Math.min(100, G.coalition + a.cD * ir));
  G.impl = a.cb?.implementationRate || G.impl;

  Object.entries(a.pScores || {}).forEach(([id, nv]) => { const pv = G.pScores[id] || 50; const bl = nv > pv ? .4 : .5; G.pScores[id] = Math.max(5, Math.min(95, pv * (1 - bl) + nv * bl)); });
  Object.entries(a.sScores || {}).forEach(([id, nv]) => { const pv = G.sScores[id] || 50; const bl = nv > pv ? .4 : .5; G.sScores[id] = Math.max(5, Math.min(95, pv * (1 - bl) + nv * bl)); });

  // Social network influence — personas affect each other
  socialInfluence(G, era);

  if (a.econFx) Object.entries(a.econFx).forEach(([k, d]) => { if ((G.econ as unknown as Record<string, number>)[k] !== undefined) (G.econ as unknown as Record<string, number>)[k] += d * ir; });
  if (a.diploFx) {
    Object.entries(a.diploFx).forEach(([k, d]) => { if (G.diplo[k] !== undefined) G.diplo[k] = Math.max(0, Math.min(100, G.diplo[k] + d * ir)); });
    if (a.diploFx.russia > 0) {
      if (G.diplo.eu !== undefined) G.diplo.eu -= a.diploFx.russia * .25;
      if (G.diplo.usa !== undefined) G.diplo.usa -= a.diploFx.russia * .2;
      if (G.diplo.ukraine !== undefined) G.diplo.ukraine -= a.diploFx.russia * .3;
      if (G.diplo.nato_r !== undefined) G.diplo.nato_r -= a.diploFx.russia * .2;
    }
    Object.keys(G.diplo).forEach(k => { G.diplo[k] = Math.max(0, Math.min(100, G.diplo[k])); });
  }
  if (a.socialFx) Object.entries(a.socialFx).forEach(([k, d]) => { if (G.social[k] !== undefined) G.social[k] = Math.max(0, Math.min(100, G.social[k] + d)); });
  if (a.flags) Object.assign(G.flags, a.flags);

  // Stance updates — track changes for UI notification
  const lastPol = (G.history.length ? G.history[G.history.length - 1].p : '').toLowerCase();
  const stanceLabels: Record<string, string> = { ekonomika: 'Ekonomika', eu: 'EÚ/NATO', rusko: 'Rusko', social: 'Sociálna', media: 'Média', justicia: 'Justícia', migracia: 'Migrácia', identita: 'Identita' };
  const stanceChanges: string[] = [];
  if (lastPol) {
    const prevStances = { ...G.stances };
    const stMap = [
      { kws: ['eu', 'nato', 'brusel', 'európ'], k: 'eu', d: 1 }, { kws: ['sovereign', 'suverenita', 'suverén'], k: 'eu', d: -1 },
      { kws: ['sovereign', 'suverenita', 'národn', 'tradíci'], k: 'identita', d: 1 },
      { kws: ['russia', 'rusko', 'moskva'], k: 'rusko', d: 1 }, { kws: ['social', 'pension', 'dochodok', 'dôchod', 'sociáln'], k: 'social', d: 1 },
      { kws: ['tax', 'dan', 'daň', 'konsolidáci'], k: 'ekonomika', d: -1 }, { kws: ['invest', 'startup', 'biznis', 'podnik'], k: 'ekonomika', d: 1 },
      { kws: ['media', 'rtvs', 'stvr', 'tlač'], k: 'media', d: -1 }, { kws: ['transparentnosť', 'slobod'], k: 'media', d: 1 },
      { kws: ['súd', 'justíci', 'reform', 'právny štát'], k: 'justicia', d: 1 }, { kws: ['kontrolovať súd', 'ovládnuť'], k: 'justicia', d: -1 },
      { kws: ['migráci', 'migrant', 'azyl', 'utečen'], k: 'migracia', d: -1 }, { kws: ['kvóty', 'solidarit'], k: 'migracia', d: 1 },
      { kws: ['ukraine', 'ukrajin'], k: 'eu', d: 1 }, { kws: ['mier', 'peace', 'neutralit'], k: 'rusko', d: 1 },
    ];
    stMap.forEach(m => { if (m.kws.some(k => lastPol.includes(k))) { G.stances[m.k] = Math.max(-5, Math.min(5, (G.stances[m.k] || 0) + m.d)); } });
    Object.entries(G.stances).forEach(([k, v]) => {
      const d = v - (prevStances[k] || 0);
      if (d !== 0) stanceChanges.push(`${stanceLabels[k] || k} ${d > 0 ? '→ doprava' : '→ doľava'}`);
    });
  }
  // Show stance notification
  const stanceEl = document.getElementById('stanceNotification');
  if (stanceEl) {
    if (stanceChanges.length) { stanceEl.textContent = '🧭 ' + stanceChanges.join(' | '); stanceEl.style.display = 'block'; }
    else stanceEl.style.display = 'none';
  }

  if (a.consequence) {
    const fireMonth = Math.min(G.month + (a.consequence.delay || 3), era.totalMonths - 1);
    G.cq.push({ ev: a.consequence, fire: fireMonth, originP: G.history[G.history.length - 1]?.p || '', originM: G.month, prob: a.consequence.probability || .5 });
  }

  Object.entries(G.cp).forEach(([id, p]) => { if (p.on) p.sat = G.sScores[id] || 50; });

  // ═══ ECONOMICS ENGINE ═══
  // Business cycle (sine wave + random shocks + mean reversion)
  businessCycleTick(G);
  // GDP from growth rate
  G.econ.gdp = Math.max(1, G.econ.gdp * (1 + G.econ.gdpGrowth / 1200));
  // Deficit dynamics (social spending, tax revenue from growth)
  deficitDynamics(G);
  // Debt from deficit
  G.econ.debt = Math.max(0, G.econ.debt + G.econ.deficit / 12);
  // EU funds flow based on diplomatic relations
  euFundsLink(G);
  // Smart minimum wage (annual, inflation-linked)
  smartMinWage(G);
  // Clamp economy values
  G.econ.gdpGrowth = Math.max(-5, Math.min(15, G.econ.gdpGrowth));
  G.econ.unemp = Math.max(2, Math.min(30, G.econ.unemp));
  G.econ.infl = Math.max(0, Math.min(25, G.econ.infl));
  // Economic feedback loops (unemployment/inflation drag approval)
  econFeedback(G);
  // Diplomatic feedback (NATO→stability, Russia→energy, Czech→trade)
  diploFeedback(G);
  // Incumbency penalty (natural approval/stability erosion)
  incumbencyPenalty(G);
  // Economic crisis triggers (displayed after updateDash to avoid being overwritten)
  const crisisMsg = econCrisisCheck(G);

  // ═══ NEW MECHANICS ═══
  okunsLaw(G);
  fdiDynamics(G);
  fiscalHealth(G);
  laborMarketTick(G);
  updatePolling(G);
  computeShapley(G, era);

  // President transition flags
  if (era.meta.pellegriniMonth >= 0 && G.month === era.meta.pellegriniMonth) G.pellegrini = true;
  if ((era.meta as unknown as Record<string, unknown>).presidentUnfriendlyMonth !== undefined) {
    const ufm = (era.meta as unknown as Record<string, unknown>).presidentUnfriendlyMonth as number;
    if (ufm >= 0 && G.month === ufm) G.pellegrini = false;
  }

  // Opposition strategy AI
  const oppAction = oppositionMove(G, era);
  if (oppAction.action) {
    G.approval = Math.max(0, Math.min(100, G.approval + oppAction.effect.approval));
    G.stability = Math.max(0, Math.min(100, G.stability + oppAction.effect.stability));
    G.coalition = Math.max(0, Math.min(100, G.coalition + oppAction.effect.coalition));
  }
  const oppEl = document.getElementById('oppositionAction');
  if (oppEl) {
    if (oppAction.action) { oppEl.textContent = oppAction.action; oppEl.style.display = 'block'; }
    else oppEl.style.display = 'none';
  }

  // Final clamp after all post-processing
  G.approval = Math.max(0, Math.min(100, G.approval));
  G.stability = Math.max(0, Math.min(100, G.stability));
  G.coalition = Math.max(0, Math.min(100, G.coalition));
  G.econ.gdpGrowth = Math.max(-5, Math.min(15, G.econ.gdpGrowth));
  G.econ.unemp = Math.max(2, Math.min(30, G.econ.unemp));
  G.econ.infl = Math.max(0, Math.min(25, G.econ.infl));

  G.approvalH.push(G.approval);
  G.month++;
  // Coalition dynamics with Nash bargaining
  nashBargaining(G, era);

  // Save
  try {
    const sv = JSON.parse(JSON.stringify(G)) as Record<string, unknown>;
    sv.used = Array.from(G.used);
    localStorage.setItem(era.meta.saveKey, JSON.stringify(sv));
  } catch (_e) { /* ignore */ }

  if (G.approval < era.gameOverThreshold || G.stability < era.gameOverThreshold || G.coalition < era.gameOverThreshold) {
    gameOver(true);
  } else if (G.month >= era.totalMonths) {
    gameOver(false);
  } else {
    updateDash();
    if (crisisMsg) {
      const crisisEl = document.getElementById('warningBanner');
      if (crisisEl) { crisisEl.innerHTML = (crisisEl.innerHTML || '') + (crisisEl.innerHTML ? '<br>' : '') + crisisMsg; crisisEl.classList.add('show'); }
    }
    showScreen('dashboardScreen');
  }
}

export function gameOver(collapsed: boolean) {
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
    if (G.social.press < 30 && G.approval > 50) { title = 'Autoritárska konsolidácia'; narr = 'Oslabili ste demokratické inštitúcie.'; }
    if (G.diplo.eu < 20) { title = 'Izolácia od EÚ'; narr = 'Vzťahy s EÚ na historickom minime. Fondy zmrazené.'; }
    if (G.flags.national_unity) { title = 'Národná jednota'; narr = 'Po atentáte ste zvolili cestu zmierenia. Slovensko je jednotnejšie.'; }
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

  // Reality comparison section
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

  el('approvalChart').innerHTML = G.approvalH.map((v, i) =>
    `<div class="chart-bar" style="height:${(v / 100) * 160}px"><div class="chart-bar-label">${i % 6 === 0 ? getCalendarDate(i).substring(0, 3) : ''}</div></div>`
  ).join('');

  // Election simulation (Monte Carlo + D'Hondt)
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
  el('approvalChart').innerHTML = G.approvalH.map((v, i) =>
    `<div class="chart-bar" style="height:${(v / 100) * 160}px"><div class="chart-bar-label">${i % 6 === 0 ? getCalendarDate(i).substring(0, 3) : ''}</div></div>`
  ).join('');
  localStorage.removeItem(era.meta.saveKey);
  showScreen('gameOverScreen');
}

// Expose for inline onclick handlers
(window as unknown as Record<string, unknown>).__doKick = doKick;
(window as unknown as Record<string, unknown>).__closeModal = closeModal;
(window as unknown as Record<string, unknown>).__handleDem = handleDem;
(window as unknown as Record<string, unknown>).__kickP = kickP;
