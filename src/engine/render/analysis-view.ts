import type { AnalysisResult } from '../types';
import { getEra, getState } from '../state';
import { esc } from '../sanitize';

export function showAnalysis(a: AnalysisResult) {
  const G = getState();
  const era = getEra();

  const scores = [{ l: 'Podpora', v: G.approval, d: a.aD }, { l: 'Stabilita', v: G.stability, d: a.stD }, { l: 'Koalícia', v: G.coalition, d: a.cD }];
  document.getElementById('scoreCardsContainer')!.innerHTML = scores.map(s => {
    const nv = Math.max(0, Math.min(100, s.v + s.d));
    const dc = s.d > 0 ? 'delta-positive' : s.d < 0 ? 'delta-negative' : 'delta-neutral';
    return `<div class="score-card"><div class="score-label">${s.l}</div><div class="score-number">${Math.round(nv)}</div><div class="score-bar"><div class="metric-fill" style="background:linear-gradient(90deg,var(--green),var(--yellow));width:${nv}%"></div></div><div class="score-delta ${dc}">${s.d > 0 ? '+' : ''}${s.d} bodov</div></div>`;
  }).join('');

  // Checks & Balances
  const cb = a.cb;
  if (cb) {
    document.getElementById('checksSection')!.style.display = 'block';
    const cbR = cb.reasons || {};
    document.getElementById('checksContent')!.innerHTML = [
      { l: 'Parlament', v: cb.parliament, r: cbR.parliament },
      { l: 'Ústavný súd', v: cb.court, r: cbR.court },
      { l: 'Prezident', v: cb.president, r: cbR.president },
      { l: 'Implementácia', v: cb.implementationRate },
    ].map(c => `<div class="check-card"><div class="check-label">${esc(c.l)}</div><div class="check-value ${(c.v || 0) >= 50 ? 'check-passed' : 'check-failed'}">${c.v || '?'}</div>${c.r ? '<div style="font-size:.7rem;color:var(--text-dim);margin-top:4px;line-height:1.4;text-align:left">' + esc(c.r) + '</div>' : ''}</div>`).join('');
  }

  // Civil service
  const cs = a.cs || {};
  document.getElementById('civilServiceContent')!.innerHTML = `<p>${esc(cs.summary || 'Analyzované.')}</p><div class="risk-pills"><span class="risk-pill ${esc((cs.risk || 'medium').toLowerCase())}">Riziko: ${esc(cs.risk || 'Medium')}</span><span class="risk-pill ${esc((cs.treasuryCost || 'medium').toLowerCase())}">Náklady: ${esc(cs.treasuryCost || 'Medium')}</span><span class="risk-pill ${esc((cs.growthPotential || 'medium').toLowerCase())}">Rast: ${esc(cs.growthPotential || 'Medium')}</span></div><div class="fiscal-note">${esc(cs.recommendation || '')}</div>`;

  // Budget
  const ef = a.econFx || {};
  const hasEconChange = Object.values(ef).some(v => Math.abs(v || 0) > 0.001);
  if (!hasEconChange) {
    document.getElementById('budgetSection')!.innerHTML = '';
  } else {
    document.getElementById('budgetSection')!.innerHTML = `<div class="analysis-section"><h3 class="section-title">💰 Rozpočtový dopad</h3><div class="section-content">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:10px 0">
        <div style="text-align:center;padding:10px;background:rgba(255,255,255,.03);border-radius:6px"><div style="font-size:.7rem;color:var(--text-dim);font-weight:600">DOPAD NA HDP</div><div style="font-size:1.2rem;font-weight:700;font-family:var(--mono);color:${(ef.gdpGrowth || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${(ef.gdpGrowth || 0) >= 0 ? '+' : ''}${(ef.gdpGrowth || 0).toFixed(2)}%</div></div>
        <div style="text-align:center;padding:10px;background:rgba(255,255,255,.03);border-radius:6px"><div style="font-size:.7rem;color:var(--text-dim);font-weight:600">DEFICIT</div><div style="font-size:1.2rem;font-weight:700;font-family:var(--mono);color:${(ef.deficit || 0) <= 0 ? 'var(--green)' : 'var(--red)'}">${(ef.deficit || 0) >= 0 ? '+' : ''}${(ef.deficit || 0).toFixed(2)} ${era.meta.currencyBig || 'mld €'}</div></div>
        <div style="text-align:center;padding:10px;background:rgba(255,255,255,.03);border-radius:6px"><div style="font-size:.7rem;color:var(--text-dim);font-weight:600">INFLÁCIA</div><div style="font-size:1.2rem;font-weight:700;font-family:var(--mono);color:${(ef.infl || 0) <= 0 ? 'var(--green)' : 'var(--red)'}">${(ef.infl || 0) >= 0 ? '+' : ''}${(ef.infl || 0).toFixed(2)}%</div></div>
        <div style="text-align:center;padding:10px;background:rgba(255,255,255,.03);border-radius:6px"><div style="font-size:.7rem;color:var(--text-dim);font-weight:600">NEZAMESTNANOSŤ</div><div style="font-size:1.2rem;font-weight:700;font-family:var(--mono);color:${(ef.unemp || 0) <= 0 ? 'var(--green)' : 'var(--red)'}">${(ef.unemp || 0) >= 0 ? '+' : ''}${(ef.unemp || 0).toFixed(2)}%</div></div>
      </div>
      <div class="fiscal-note"><strong>Aktuálny stav:</strong> HDP ${G.econ.gdp.toFixed(1)} ${era.meta.currencyBig || 'mld €'} | Deficit ${G.econ.deficit.toFixed(1)} ${era.meta.currencyBig || 'mld €'} | Dlh ${G.econ.debt.toFixed(1)} ${era.meta.currencyBig || 'mld €'}</div>
    </div></div>`;
  }

  // Press
  const pr = a.press || { left: { headline: '—', subhead: '' }, center: { headline: '—', subhead: '' }, right: { headline: '—', subhead: '' } };
  const hl = era.headlines;
  document.getElementById('pressContent')!.innerHTML = `<div class="press-section">
    <div class="press-column left"><div class="press-outlet">${esc(hl.left.name)}</div><div class="press-headline">${esc(pr.left.headline)}</div><div class="press-subhead" style="margin-top:6px;line-height:1.5">${esc(pr.left.subhead)}</div></div>
    <div class="press-column center"><div class="press-outlet">${esc(hl.center.name)}</div><div class="press-headline">${esc(pr.center.headline)}</div><div class="press-subhead" style="margin-top:6px;line-height:1.5">${esc(pr.center.subhead)}</div></div>
    <div class="press-column right"><div class="press-outlet">${esc(hl.right.name)}</div><div class="press-headline">${esc(pr.right.headline)}</div><div class="press-subhead" style="margin-top:6px;line-height:1.5">${esc(pr.right.subhead)}</div></div>
  </div>`;

  // Politicians
  const policy = G.history.length ? G.history[G.history.length - 1].p.toLowerCase() : '';
  const polHtml = era.politicians.map(pol => {
    const hasPos = pol.kw_pos.some(k => policy.includes(k));
    const hasNeg = pol.kw_neg.some(k => policy.includes(k));
    let reaction: string, mood: string;
    if (hasPos && !hasNeg) { mood = 'pos'; reaction = pol.reactions.pos[Math.floor(Math.random() * pol.reactions.pos.length)]; }
    else if (hasNeg && !hasPos) { mood = 'neg'; reaction = pol.reactions.neg[Math.floor(Math.random() * pol.reactions.neg.length)]; }
    else { mood = 'neu'; reaction = pol.reactions.neu[Math.floor(Math.random() * pol.reactions.neu.length)]; }
    const moodCol = mood === 'pos' ? 'var(--green)' : mood === 'neg' ? 'var(--red)' : '#a0a0b0';
    const moodDot = mood === 'pos' ? '🟢' : mood === 'neg' ? '🔴' : '🟡';
    const moodLabel = mood === 'pos' ? 'ZA' : mood === 'neg' ? 'PROTI' : 'NEUTRÁL';
    const borderCol = mood === 'pos' ? 'rgba(74,222,128,.25)' : mood === 'neg' ? 'rgba(248,113,113,.25)' : 'rgba(255,255,255,.07)';
    const bgCol = mood === 'pos' ? 'rgba(74,222,128,.04)' : mood === 'neg' ? 'rgba(248,113,113,.04)' : 'rgba(255,255,255,.01)';
    return `<div style="display:flex;gap:12px;padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.06);border-left:3px solid ${borderCol};background:${bgCol};align-items:flex-start;margin-bottom:2px">` +
      `<span style="font-size:1.5rem;line-height:1;flex-shrink:0;margin-top:2px">${esc(pol.emoji)}</span>` +
      `<div style="flex:1;min-width:0">` +
        `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">` +
          `<span style="font-weight:700;font-size:.9rem;color:#fff;letter-spacing:.01em">${esc(pol.name)}</span>` +
          `<span style="font-size:.68rem;font-weight:600;color:#888;background:rgba(255,255,255,.07);padding:1px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.04em">${esc(pol.party)}</span>` +
          `<span style="font-size:.68rem;color:var(--text-dim);font-style:italic">${esc(pol.role)}</span>` +
          `<span style="margin-left:auto;font-size:.68rem;font-weight:700;color:${moodCol};display:flex;align-items:center;gap:3px;white-space:nowrap">${moodDot} ${moodLabel}</span>` +
        `</div>` +
        `<div style="font-size:.82rem;color:${moodCol};line-height:1.5;padding:7px 10px;background:rgba(255,255,255,.03);border-radius:5px;border-left:2px solid ${borderCol}">` +
          `<span style="color:rgba(255,255,255,.3);font-size:1rem;line-height:0;vertical-align:middle;margin-right:3px">"</span>${esc(reaction)}<span style="color:rgba(255,255,255,.3);font-size:1rem;line-height:0;vertical-align:middle;margin-left:3px">"</span>` +
        `</div>` +
      `</div>` +
    `</div>`;
  }).join('');
  document.getElementById('politicianContent')!.innerHTML = polHtml;

  // Consequence
  if (a.consequence) { document.getElementById('consequenceSection')!.style.display = 'block'; document.getElementById('consequenceContent')!.innerHTML = `<p style="color:#fde68a">⚠️ Vaše rozhodnutie môže mať dôsledky v budúcnosti.</p>`; }
  else document.getElementById('consequenceSection')!.style.display = 'none';
}

export function showFG(a: AnalysisResult) {
  const era = getEra();
  const sc = a.pScores || {};
  const sorted = Object.keys(sc).sort((x, y) => (sc[y] || 50) - (sc[x] || 50));
  let sum = 0, html = '';
  sorted.forEach(id => {
    const p = era.personas.find(x => x.id === id);
    if (!p) return;
    const s = sc[id] || 50; sum += s;
    const q = era.personaQuotes[id] || {};
    let tierKey: keyof typeof q = 'n';
    if (s >= 75) tierKey = 'vp'; else if (s >= 60) tierKey = 'p'; else if (s >= 40) tierKey = 'n'; else if (s >= 25) tierKey = 'ng'; else tierKey = 'vn';
    const qArr = q[tierKey];
    const qtRaw = Array.isArray(qArr) && qArr.length ? qArr[Math.floor(Math.random() * qArr.length)] : qArr;
    const qt: string = typeof qtRaw === 'string' ? qtRaw : 'Bez komentára.';
    const col = s > 60 ? 'var(--green)' : s > 40 ? 'var(--yellow)' : 'var(--red)';
    html += `<div class="persona-card"><div class="persona-header"><div class="persona-emoji">${esc(p.emoji)}</div><div><div class="persona-name">${esc(p.name)}</div><div class="persona-demo">${esc(p.demo)}</div><span class="persona-lean ${esc(p.lean)}">${esc(p.lean)}</span></div></div><div class="persona-score" style="color:${col}">${Math.round(s)}</div><div class="persona-bar"><div class="metric-fill" style="background:${col};width:${s}%"></div></div><div class="persona-quote">"${esc(qt)}"</div></div>`;
  });
  document.getElementById('personasContainer')!.innerHTML = html;
  document.getElementById('averagePersonaScore')!.textContent = sorted.length ? String(Math.round(sum / sorted.length)) : '--';
}

export function showSH(a: AnalysisResult) {
  const era = getEra();
  const G = getState();
  const sc = a.sScores || {};
  const sorted = Object.keys(sc).sort((x, y) => (sc[y] || 50) - (sc[x] || 50));
  let sum = 0, html = '';
  sorted.forEach(id => {
    const s = era.stakeholders.find(x => x.id === id);
    if (!s) return;
    const v = sc[id] || 50; const base = G.sScores[id] || 50; const d = v - base; sum += v;
    const col = v > 60 ? 'var(--green)' : v > 40 ? 'var(--yellow)' : 'var(--red)';
    const dc = d > 0 ? 'delta-positive' : d < 0 ? 'delta-negative' : 'delta-neutral';
    html += `<div class="stakeholder-card"><div class="stakeholder-header"><div class="stakeholder-header-left"><div class="stakeholder-name-card">${esc(s.name)}</div><div class="stakeholder-desc">${esc(s.desc)}</div></div><div class="stakeholder-score-card" style="color:${col}">${Math.round(v)}</div></div><div class="stakeholder-bar-card"><div class="metric-fill" style="background:${col};width:${v}%"></div></div><div class="stakeholder-delta ${dc}">${d > 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(0)}</div></div>`;
  });
  document.getElementById('stakeholdersContainer')!.innerHTML = html;
  document.getElementById('averageStakeholderScore')!.textContent = sorted.length ? String(Math.round(sum / sorted.length)) : '--';
}
