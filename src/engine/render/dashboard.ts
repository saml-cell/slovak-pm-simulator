import { getEra, getState, getCalendarDate, getFullDate, coalitionSeats } from '../state';
import { esc } from '../sanitize';

function upMetric(valId: string, fillId: string, trendId: string, val: number, prev: number) {
  const el = document.getElementById(valId);
  const fill = document.getElementById(fillId);
  const trend = document.getElementById(trendId);
  if (!el || !fill || !trend) return;
  el.textContent = Math.round(val) + '%';
  fill.style.width = val + '%';
  const d = val - prev;
  if (d > 0) { trend.className = 'metric-trend trend-up'; trend.innerHTML = `↑ +${d.toFixed(1)}`; }
  else if (d < 0) { trend.className = 'metric-trend trend-down'; trend.innerHTML = `↓ ${d.toFixed(1)}`; }
  else { trend.className = 'metric-trend trend-neutral'; trend.innerHTML = '— 0'; }
}

function renderEconomy(): string {
  const G = getState();
  const era = getEra();
  const e = G.econ;
  const big = era.meta.currencyBig || 'mld €';
  const cur = era.meta.currency || '€';
  return `<div class="dashboard-panel"><div class="panel-title">💰 Ekonomika</div>
    <div class="economy-row"><span class="economy-label">HDP</span><span class="economy-value">${e.gdp.toFixed(1)} ${big}</span></div>
    <div class="economy-row"><span class="economy-label">Rast HDP</span><span class="economy-value" style="color:${e.gdpGrowth >= 0 ? 'var(--green)' : 'var(--red)'}">${e.gdpGrowth.toFixed(1)}%</span></div>
    <div class="economy-row"><span class="economy-label">Nezamestnanosť</span><span class="economy-value">${e.unemp.toFixed(1)}%</span></div>
    <div class="economy-row"><span class="economy-label">Inflácia</span><span class="economy-value">${e.infl.toFixed(1)}%</span></div>
    <div class="economy-row"><span class="economy-label">Deficit</span><span class="economy-value" style="color:${e.deficit <= 0 ? 'var(--green)' : 'var(--red)'}">${e.deficit.toFixed(1)} ${big}</span></div>
    <div class="economy-row"><span class="economy-label">Dlh</span><span class="economy-value">${e.debt.toFixed(1)} ${big}</span></div>
    <div class="economy-row"><span class="economy-label">Min. mzda</span><span class="economy-value">${Math.round(e.minW)} ${cur}</span></div>
    <div class="economy-row"><span class="economy-label">EÚ fondy</span><span class="economy-value" style="color:${G.euFundsFlow > 4 ? 'var(--green)' : G.euFundsFlow > 2 ? 'var(--yellow)' : 'var(--red)'}">${G.euFundsFlow.toFixed(1)} ${big}/rok</span></div>
    <div class="economy-row"><span class="economy-label">Dlh/HDP</span><span class="economy-value" style="color:${G.debtToGdp > 60 ? G.debtToGdp > 90 ? 'var(--red)' : 'var(--yellow)' : 'var(--green)'}">${G.debtToGdp.toFixed(1)}%</span></div>
    <div class="economy-row"><span class="economy-label">Úroková sadzba</span><span class="economy-value" style="color:${G.interestRate > 5 ? 'var(--red)' : G.interestRate > 3 ? 'var(--yellow)' : 'var(--green)'}">${G.interestRate.toFixed(1)}%</span></div>
    <div class="economy-row"><span class="economy-label">Zahraničné invest.</span><span class="economy-value" style="color:${G.fdi > 5 ? 'var(--green)' : G.fdi > 2 ? 'var(--yellow)' : 'var(--red)'}">${G.fdi.toFixed(1)} ${big}/rok</span></div>
    <div class="economy-row"><span class="economy-label">Participácia</span><span class="economy-value">${G.laborParticipation.toFixed(1)}%</span></div>
  </div>`;
}

function renderCoalition(): string {
  const G = getState();
  const era = getEra();
  let html = '';
  era.coalitionPartners.forEach(cp => {
    const p = G.cp[cp.id];
    if (!p) return;
    const status = !p.on ? 'gone' : p.sat < 30 ? 'threatening' : p.sat < 50 ? 'uneasy' : 'content';
    html += `<div class="partner-card ${status}">
      <div class="partner-name">${cp.name}</div>
      <div class="partner-seats">${cp.seats} kresiel</div>
      <div class="partner-stats">
        <div class="partner-stat"><div class="partner-stat-label">Spokojnosť</div><div class="partner-stat-value">${Math.round(p.sat)}</div></div>
        <div class="partner-stat"><div class="partner-stat-label">Trpezlivosť</div><div class="partner-stat-value">${Math.round(p.pat)}</div></div>
      </div>
      ${G.shapleyPower[cp.id] !== undefined ? `<div style="font-size:.7rem;color:var(--text-dim);margin-top:4px">Vyj. sila: <span style="color:var(--gold)">${Math.round((G.shapleyPower[cp.id] || 0) * 100)}%</span></div>` : ''}
      ${p.dem ? `<div class="partner-demand">⚠️ ${esc(p.dem)}</div><div><button class="partner-btn concede" onclick="window.__handleDem('${esc(cp.id)}','c')">Ustúpiť</button><button class="partner-btn negotiate" onclick="window.__handleDem('${esc(cp.id)}','n')">Vyjednávať</button><button class="partner-btn refuse" onclick="window.__handleDem('${esc(cp.id)}','r')">Odmietnuť</button></div>` : ''}
      ${p.on ? `<button class="partner-btn kick" onclick="window.__kickP('${esc(cp.id)}')">Vyhodiť</button>` : '<div style="color:var(--text-dim);font-size:.8rem">Odišli z koalície</div>'}
    </div>`;
  });
  return `<div class="dashboard-panel"><div class="panel-title">🤝 Koalícia</div>${html}</div>`;
}

function renderParliament(): string {
  const G = getState();
  const era = getEra();
  const colors = era.partyDisplay.colors;
  const names = era.partyDisplay.names;
  const total = 150;
  const segments = Object.entries(G.parl)
    .filter(([_, seats]) => seats > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([id, seats]) => `<div class="parliament-segment" style="width:${(seats / total) * 100}%;background:${colors[id] || '#4a5568'}"></div>`)
    .join('');
  const legend = Object.entries(G.parl)
    .filter(([_, seats]) => seats > 0)
    .map(([id, seats]) => `<span class="parliament-legend-item"><span class="parliament-legend-dot" style="background:${colors[id] || '#4a5568'}"></span>${names[id] || id} ${seats}</span>`)
    .join('');
  const cs = coalitionSeats();
  return `<div class="parliament-bar"><div class="panel-title">🏛️ Parlament (${cs}/150)</div><div class="parliament-visual">${segments}</div><div class="parliament-legend">${legend}</div></div>`;
}

function renderDiplomacy(): string {
  const G = getState();
  const era = getEra();
  let rows = '';
  era.diplomacy.forEach(d => {
    const v = G.diplo[d.key] ?? 50;
    const col = v > 60 ? 'var(--green)' : v > 40 ? 'var(--yellow)' : 'var(--red)';
    rows += `<div class="economy-row"><span class="economy-label">${d.emoji || ''} ${d.name}</span><span class="economy-value" style="color:${col}">${Math.round(v)}</span></div>`;
  });
  return `<div class="dashboard-panel"><div class="panel-title">🌍 Diplomacia</div>${rows}</div>`;
}

function renderStances(): string {
  const G = getState();
  const labels: Record<string, string> = {
    ekonomika: 'Ekonomika', eu: 'EÚ/NATO', rusko: 'Rusko', social: 'Sociálna', media: 'Média',
    justicia: 'Justícia', migracia: 'Migrácia', identita: 'Identita',
  };
  let items = '';
  Object.entries(G.stances).forEach(([k, v]) => {
    const pct = ((v + 5) / 10) * 100;
    const label = v > 1 ? 'doprava' : v < -1 ? 'doľava' : 'stred';
    items += `<div style="display:flex;align-items:center;gap:8px;font-size:.8rem"><span style="min-width:80px;color:var(--text-dim)">${labels[k] || k}</span><div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px;position:relative"><div style="position:absolute;width:8px;height:8px;border-radius:50%;background:var(--gold);top:-2px;left:${pct}%;transform:translateX(-50%)"></div></div><span style="min-width:60px;text-align:right;font-family:var(--mono);font-size:.75rem;color:var(--text-dim)">${label}</span></div>`;
  });
  return `<div class="dashboard-panel"><div class="panel-title">🧭 Politický profil</div><div style="display:flex;flex-direction:column;gap:8px">${items}</div></div>`;
}

function renderMap(): string {
  const G = getState();
  const era = getEra();
  // Compute average persona score per region
  const regionScores: Record<string, { sum: number; count: number }> = {};
  era.regions.forEach(r => {
    let sum = 0, count = 0;
    r.personas.forEach(pid => {
      const s = G.pScores[pid];
      if (s !== undefined) { sum += s; count++; }
    });
    regionScores[r.id] = { sum, count };
  });
  const getColor = (id: string) => {
    const r = regionScores[id];
    if (!r || !r.count) return '#2d3748';
    const avg = r.sum / r.count;
    if (avg >= 65) return '#10b981';
    if (avg >= 50) return '#c9a84c';
    if (avg >= 35) return '#f97316';
    return '#ef4444';
  };
  const getScore = (id: string) => {
    const r = regionScores[id];
    return r && r.count ? Math.round(r.sum / r.count) : '--';
  };
  // Slovakia region paths — traced from actual geographic borders
  // viewBox "0 0 500 200", country ~450km W-E, ~200km N-S
  const regions: { id: string; name: string; path: string; tx: number; ty: number }[] = [
    { id: 'bratislavsky', name: 'BA', path: 'M38,128 C40,120 48,112 55,108 L68,104 L78,110 L82,120 C80,128 74,136 68,140 L52,142 C44,140 40,134 38,128 Z', tx: 60, ty: 124 },
    { id: 'trnavsky', name: 'TT', path: 'M68,104 L78,96 C86,88 95,82 105,80 L120,82 L132,92 L128,108 L118,120 C108,130 92,136 82,138 L68,140 C74,136 80,128 82,120 L78,110 Z', tx: 100, ty: 110 },
    { id: 'nitriansky', name: 'NR', path: 'M82,120 L118,120 L128,108 L148,104 L160,112 C166,122 170,136 172,148 L164,162 C152,172 136,178 118,176 L96,170 C86,164 80,152 78,142 L68,140 L82,138 Z', tx: 125, ty: 146 },
    { id: 'trenciansky', name: 'TN', path: 'M105,80 C112,68 118,56 126,46 L138,38 C146,34 156,32 164,36 L172,44 L168,62 C164,76 158,88 152,96 L148,104 L128,108 L132,92 L120,82 Z', tx: 140, ty: 68 },
    { id: 'zilinsky', name: 'ZA', path: 'M164,36 C176,30 192,24 208,22 L228,24 C240,28 248,36 254,46 L258,62 L248,78 C238,88 226,94 214,96 L198,94 C186,90 176,82 168,72 L168,62 L172,44 Z', tx: 214, ty: 58 },
    { id: 'banskobystricky', name: 'BB', path: 'M148,104 L152,96 C158,88 164,76 168,62 L168,72 C176,82 186,90 198,94 L214,96 L248,78 L258,62 L278,68 C290,76 298,88 302,102 L298,118 C292,134 282,148 268,158 L248,166 C228,170 206,168 186,162 L172,148 C170,136 166,122 160,112 Z', tx: 228, ty: 120 },
    { id: 'presovsky', name: 'PO', path: 'M258,62 L254,46 C262,38 274,30 288,24 L310,20 C330,18 352,20 370,26 L390,36 C398,42 404,52 406,62 L402,76 C396,86 386,94 374,98 L352,102 L328,100 L302,102 C298,88 290,76 278,68 Z', tx: 340, ty: 58 },
    { id: 'kosicky', name: 'KE', path: 'M302,102 L328,100 L352,102 L374,98 C386,94 396,86 402,76 L406,62 C410,72 416,84 418,96 L416,114 C412,130 404,144 392,154 L374,164 C356,172 334,176 312,174 L290,168 L268,158 C282,148 292,134 298,118 Z', tx: 362, ty: 126 },
  ];
  const paths = regions.map(r =>
    `<path d="${r.path}" fill="${getColor(r.id)}" stroke="rgba(255,255,255,.2)" stroke-width="1" style="cursor:pointer"><title>${r.name}: ${getScore(r.id)}%</title></path>` +
    `<text x="${r.tx}" y="${r.ty}" fill="#fff" font-size="9" text-anchor="middle" font-weight="700" style="pointer-events:none">${r.name}</text>` +
    `<text x="${r.tx}" y="${r.ty + 11}" fill="rgba(255,255,255,.7)" font-size="8" text-anchor="middle" style="pointer-events:none">${getScore(r.id)}</text>`
  ).join('');
  return `<div class="dashboard-panel"><div class="panel-title">🗺️ Regióny</div>
    <svg viewBox="20 10 420 185" style="width:100%;height:auto;margin:8px 0">${paths}</svg>
    <div style="display:flex;gap:8px;justify-content:center;font-size:.65rem;color:var(--text-dim)">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#10b981;margin-right:2px"></span>65+</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#c9a84c;margin-right:2px"></span>50-64</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#f97316;margin-right:2px"></span>35-49</span>
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#ef4444;margin-right:2px"></span>&lt;35</span>
    </div></div>`;
}

function renderAdvancedMetrics(): string {
  const G = getState();
  const capCol = G.politicalCapital > 50 ? 'var(--green)' : G.politicalCapital > 25 ? 'var(--yellow)' : 'var(--red)';
  const fatCol = G.crisisFatigue < 0.3 ? 'var(--green)' : G.crisisFatigue < 0.6 ? 'var(--yellow)' : 'var(--red)';
  const momCol = G.momentum > 0.2 ? 'var(--green)' : G.momentum < -0.2 ? 'var(--red)' : 'var(--text-dim)';
  const momLabel = G.momentum > 0.3 ? '↑ Rastúci' : G.momentum < -0.3 ? '↓ Klesajúci' : '— Stabilný';
  return `<div class="dashboard-panel" style="margin-top:12px"><div class="panel-title">⚙️ Vládna sila</div>
    <div class="economy-row"><span class="economy-label">Politický kapitál</span><span class="economy-value" style="color:${capCol}">${Math.round(G.politicalCapital)}</span></div>
    <div class="economy-row"><span class="economy-label">Únava z kríz</span><span class="economy-value" style="color:${fatCol}">${Math.round(G.crisisFatigue * 100)}%</span></div>
    <div class="economy-row"><span class="economy-label">Momentum</span><span class="economy-value" style="color:${momCol}">${momLabel}</span></div>
    <div class="economy-row"><span class="economy-label">Mediálny cyklus</span><span class="economy-value" style="color:${G.mediaCycle > 0.6 ? 'var(--red)' : G.mediaCycle > 0.3 ? 'var(--yellow)' : 'var(--green)'}">${G.mediaCycle > 0.5 ? '🔥 Horúce' : G.mediaCycle > 0.2 ? '📰 Aktívne' : '😴 Pokojné'}</span></div>
    <div class="economy-row"><span class="economy-label">Prieskumy</span><span class="economy-value" style="color:${G.pollApproval > 50 ? 'var(--green)' : G.pollApproval > 35 ? 'var(--yellow)' : 'var(--red)'}">~${Math.round(G.pollApproval)}%</span></div>
  </div>`;
}

function renderHistoryPanel(): string {
  const G = getState();
  if (!G.history.length) return `<div class="dashboard-panel"><div class="panel-title">📜 História</div><p style="color:var(--text-dim);font-size:.85rem">Zatiaľ žiadne rozhodnutia.</p></div>`;
  const recent = G.history.slice(-5).reverse();
  const items = recent.map(h => {
    const appr = G.approvalH[h.m + 1] !== undefined ? Math.round(G.approvalH[h.m + 1]) : '--';
    const col = typeof appr === 'number' ? (appr > 60 ? 'var(--green)' : appr > 40 ? 'var(--yellow)' : 'var(--red)') : 'var(--text-dim)';
    return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="font-family:var(--mono);color:var(--gold);font-size:.75rem;min-width:28px">M${h.m + 1}</span><span style="flex:1;font-size:.8rem;color:var(--text-dim)">${esc(h.ev || 'Udalosť')}</span><span style="font-family:var(--mono);color:${col};font-size:.8rem">${appr}</span></div>`;
  }).join('');
  return `<div class="dashboard-panel"><div class="panel-title">📜 História</div>${items}</div>`;
}

export function updateDash() {
  const G = getState();
  const era = getEra();

  upMetric('approvalValue', 'approvalFill', 'approvalTrend', G.approval, G.prevA);
  upMetric('stabilityValue', 'stabilityFill', 'stabilityTrend', G.stability, G.prevS);
  upMetric('coalitionValue', 'coalitionFill', 'coalitionTrend', G.coalition, G.prevC);
  upMetric('implValue', 'implFill', 'implTrend', G.impl, G.prevImpl);

  document.getElementById('monthDisplay')!.textContent = getFullDate(G.month);
  document.getElementById('monthNumber')!.textContent = String(G.month + 1);
  document.getElementById('playMonthName')!.textContent = getFullDate(G.month);
  document.getElementById('dashPmName')!.textContent = era.meta.headerTitle;
  document.getElementById('totalMonthsDisplay')!.textContent = String(era.totalMonths);

  // Warnings
  const wb = document.getElementById('warningBanner')!;
  const warnings: string[] = [];
  if (G.approval < 25) warnings.push('⚠️ Podpora klesla pod 25%!');
  if (G.stability < 25) warnings.push('⚠️ Stabilita vlády kriticky nízka!');
  if (G.coalition < 25) warnings.push('⚠️ Koalícia na pokraji rozpadu!');
  if (coalitionSeats() < 76) warnings.push('⚠️ Menšinová vláda! ' + coalitionSeats() + '/150 kresiel.');
  if (warnings.length) { wb.innerHTML = warnings.join('<br>'); wb.classList.add('show'); } else wb.classList.remove('show');

  // Panels
  const mapEl = document.getElementById('dashMap');
  if (mapEl) mapEl.innerHTML = renderMap();
  const econCoalEl = document.getElementById('dashEconCoalition')!;
  econCoalEl.innerHTML = renderEconomy() + renderCoalition();
  document.getElementById('dashParliament')!.innerHTML = renderParliament();
  document.getElementById('dashStances')!.innerHTML = renderStances() + renderAdvancedMetrics();
  document.getElementById('dashDiplomacy')!.innerHTML = renderDiplomacy();
  document.getElementById('dashHistory')!.innerHTML = renderHistoryPanel();
}
