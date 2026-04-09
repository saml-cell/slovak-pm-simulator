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
  // Realistic SVG paths for Slovakia's 8 regions — viewBox "0 0 420 210"
  const regions: { id: string; name: string; path: string; tx: number; ty: number }[] = [
    { id: 'bratislavsky', name: 'BA', path: 'M62,148 L78,128 L92,132 L96,148 L82,162 L66,158 Z', tx: 79, ty: 148 },
    { id: 'trnavsky', name: 'TT', path: 'M78,128 L92,108 L122,98 L138,118 L130,142 L96,148 L92,132 Z', tx: 109, ty: 127 },
    { id: 'nitriansky', name: 'NR', path: 'M96,148 L130,142 L138,118 L158,128 L170,158 L148,182 L108,178 L82,162 Z', tx: 128, ty: 158 },
    { id: 'trenciansky', name: 'TN', path: 'M92,108 L98,68 L118,48 L142,52 L152,78 L138,118 L122,98 Z', tx: 120, ty: 88 },
    { id: 'zilinsky', name: 'ZA', path: 'M142,52 L178,38 L218,42 L228,72 L208,98 L168,108 L152,78 Z', tx: 188, ty: 74 },
    { id: 'banskobystricky', name: 'BB', path: 'M138,118 L152,78 L168,108 L208,98 L248,108 L268,138 L248,178 L170,158 L158,128 Z', tx: 207, ty: 138 },
    { id: 'presovsky', name: 'PO', path: 'M218,42 L268,28 L338,32 L368,52 L358,82 L318,98 L268,108 L248,108 L228,72 Z', tx: 298, ty: 68 },
    { id: 'kosicky', name: 'KE', path: 'M248,108 L318,98 L358,82 L378,108 L368,148 L328,172 L268,168 L248,178 L268,138 Z', tx: 316, ty: 138 },
  ];
  const paths = regions.map(r =>
    `<path d="${r.path}" fill="${getColor(r.id)}" stroke="rgba(255,255,255,.2)" stroke-width="1" style="cursor:pointer"><title>${r.name}: ${getScore(r.id)}%</title></path>` +
    `<text x="${r.tx}" y="${r.ty}" fill="#fff" font-size="9" text-anchor="middle" font-weight="700" style="pointer-events:none">${r.name}</text>` +
    `<text x="${r.tx}" y="${r.ty + 11}" fill="rgba(255,255,255,.7)" font-size="8" text-anchor="middle" style="pointer-events:none">${getScore(r.id)}</text>`
  ).join('');
  return `<div class="dashboard-panel"><div class="panel-title">🗺️ Regióny</div>
    <svg viewBox="0 0 420 210" style="width:100%;height:auto;margin:8px 0">${paths}</svg>
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
