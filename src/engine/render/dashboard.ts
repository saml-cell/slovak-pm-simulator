import { getEra, getState, getFullDate, coalitionSeats } from '../state';
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
    <div style="font-size:.6rem;color:var(--gold);text-transform:uppercase;letter-spacing:1px;padding:8px 0 4px;border-bottom:1px solid rgba(224,184,74,.15);margin-top:4px">Fiškálne ukazovatele</div>
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
  const coalitionIds = new Set(era.coalitionPartners.filter(cp => G.cp[cp.id]?.on).map(cp => cp.id));
  const parties = Object.entries(G.parl)
    .filter(([_, seats]) => seats > 0)
    .sort(([a], [b]) => {
      const aCoal = coalitionIds.has(a) ? 0 : 1;
      const bCoal = coalitionIds.has(b) ? 0 : 1;
      return aCoal - bCoal;
    });
  const segments = parties
    .map(([id, seats]) => {
      const isCoal = coalitionIds.has(id);
      const name = names[id] || id;
      const opacity = isCoal ? '1' : '0.4';
      const label = `${name}: ${seats}${isCoal ? ' ✓' : ''}`;
      return `<div class="parliament-segment" style="width:${(seats / total) * 100}%;background:${colors[id] || '#4a5568'};opacity:${opacity};cursor:pointer;position:relative;transition:all .2s" onmouseenter="this.style.opacity='1';this.style.filter='brightness(1.3)';this.querySelector('.pt').style.display='block'" onmouseleave="this.style.opacity='${opacity}';this.style.filter='none';this.querySelector('.pt').style.display='none'" onclick="this.querySelector('.pt').style.display=this.querySelector('.pt').style.display==='block'?'none':'block'"><div class="pt" style="display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:rgba(10,14,20,.95);border:1px solid rgba(224,184,74,.4);padding:4px 10px;border-radius:6px;font-size:.7rem;color:#fff;white-space:nowrap;z-index:10;pointer-events:none">${esc(label)}</div></div>`;
    }).join('');
  const legend = parties
    .map(([id, seats]) => {
      const isCoal = coalitionIds.has(id);
      return `<span class="parliament-legend-item" style="${isCoal ? '' : 'opacity:.5'}"><span class="parliament-legend-dot" style="background:${colors[id] || '#4a5568'}"></span>${names[id] || id} ${seats}${isCoal ? '' : ''}</span>`;
    }).join('');
  const cs = coalitionSeats();
  const majColor = cs >= 76 ? 'rgba(16,185,129,.6)' : 'rgba(239,68,68,.6)';
  return `<div class="parliament-bar"><div class="panel-title">🏛️ Parlament — koalícia ${cs}/150 ${cs >= 76 ? '✓' : '✗'}</div><div class="parliament-visual" style="position:relative">${segments}<div style="position:absolute;left:50.67%;top:0;bottom:0;width:2px;background:${majColor};z-index:2"></div><div style="position:absolute;left:50.67%;top:-14px;font-size:.55rem;color:${majColor};transform:translateX(-50%)">76</div></div><div class="parliament-legend">${legend}</div></div>`;
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
  const poles: Record<string, [string, string]> = {
    ekonomika: ['Sociálny štát', 'Voľný trh'],
    eu: ['Suverenita', 'Euroatlantizmus'],
    rusko: ['Prozápadný', 'Proruský'],
    social: ['Liberálny', 'Konzervatívny'],
    media: ['Nezávislé médiá', 'Kontrola médií'],
    justicia: ['Právny štát', 'Politická justícia'],
    migracia: ['Otvorené hranice', 'Uzavretie hraníc'],
    identita: ['Kozmopolita', 'Nacionalista'],
  };
  let items = '';
  Object.entries(G.stances).forEach(([k, v]) => {
    const pct = Math.max(2, Math.min(98, ((v + 5) / 10) * 100));
    const [left, right] = poles[k] || ['←', '→'];
    const col = Math.abs(v) > 2 ? 'var(--red)' : Math.abs(v) > 1 ? 'var(--yellow)' : 'var(--green)';
    items += `<div style="font-size:.75rem;margin-bottom:4px"><div style="display:flex;justify-content:space-between;color:var(--text-dim);margin-bottom:2px"><span>${left}</span><span>${right}</span></div><div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;position:relative"><div style="position:absolute;width:10px;height:10px;border-radius:50%;background:${col};top:-3px;left:${pct}%;transform:translateX(-50%);border:2px solid rgba(0,0,0,.3)"></div></div></div>`;
  });
  return `<div class="dashboard-panel"><div class="panel-title">🧭 Politický profil</div><div style="display:flex;flex-direction:column;gap:6px">${items}</div></div>`;
}

function renderMap(): string {
  const G = getState();
  const era = getEra();
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
  // Paths projected from Natural Earth / world.geo.json border points
  // (lon/lat → SVG coords).
  const regions: { id: string; name: string; path: string; tx: number; ty: number }[] = [
    { id: 'bratislavsky', name: 'BA', path: 'M16.9,162.5 L8.4,126.1 L15.2,112.7 L48,140 L90,155 L162.9,188.1 L91.5,201.0 L60.2,189.5 Z', tx: 70, ty: 165 },
    { id: 'trnavsky', name: 'TT', path: 'M15.2,112.7 L27.3,89.5 L65.0,91.3 L110,118 L169.8,166.9 L162.9,188.1 L90,155 L48,140 Z', tx: 90, ty: 135 },
    { id: 'nitriansky', name: 'NR', path: 'M110,118 L200,100 L294.2,141.0 L254.2,154.2 L245.0,147.5 L203.6,163.8 L169.8,166.9 Z', tx: 200, ty: 142 },
    { id: 'trenciansky', name: 'TN', path: 'M65.0,91.3 L94.0,80.4 L96.3,70.6 L112.6,65.6 L118.2,41.7 L137.7,37.1 L150.9,18.2 L176.3,18.0 L155,78 L110,118 Z', tx: 118, ty: 68 },
    { id: 'zilinsky', name: 'ZA', path: 'M176.3,18.0 L181.1,24.4 L216.0,10.1 L258.9,47.4 L220,82 L155,78 Z', tx: 200, ty: 45 },
    { id: 'banskobystricky', name: 'BB', path: 'M155,78 L220,82 L258.9,47.4 L342,110 L294.2,141.0 L200,100 L110,118 Z', tx: 220, ty: 105 },
    { id: 'presovsky', name: 'PO', path: 'M258.9,47.4 L309.2,24.8 L349.4,35.7 L410.6,20.8 L380,72 L342,110 Z', tx: 345, ty: 58 },
    { id: 'kosicky', name: 'KE', path: 'M380,72 L410.6,20.8 L491.4,61.2 L467.8,88.6 L451.2,131.1 L433.1,141.8 L342,110 Z', tx: 425, ty: 95 },
  ];
  const paths = regions.map(r =>
    `<path d="${r.path}" fill="${getColor(r.id)}" stroke="rgba(255,255,255,.2)" stroke-width="1" style="cursor:pointer"><title>${r.name}: ${getScore(r.id)}%</title></path>` +
    `<text x="${r.tx}" y="${r.ty}" fill="#fff" font-size="9" text-anchor="middle" font-weight="700" style="pointer-events:none">${r.name}</text>` +
    `<text x="${r.tx}" y="${r.ty + 11}" fill="rgba(255,255,255,.7)" font-size="8" text-anchor="middle" style="pointer-events:none">${getScore(r.id)}</text>`
  ).join('');
  return `<div class="dashboard-panel"><div class="panel-title">🗺️ Regióny</div>
    <svg viewBox="0 0 500 210" style="width:100%;height:auto;margin:8px 0">${paths}</svg>
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
    <div style="font-size:.6rem;color:var(--gold);text-transform:uppercase;letter-spacing:1px;padding:8px 0 4px;border-bottom:1px solid rgba(224,184,74,.15);margin-top:4px">Mediálny ekosystém</div>
    <div class="economy-row"><span class="economy-label">Dezinformácie</span><span class="economy-value" style="color:${(G.social.dezinfo || 0) > 50 ? 'var(--red)' : (G.social.dezinfo || 0) > 30 ? 'var(--yellow)' : 'var(--green)'}">${Math.round(G.social.dezinfo || 0)}</span></div>
    <div class="economy-row"><span class="economy-label">Dôvera v médiá</span><span class="economy-value" style="color:${(G.social.mediaTrust || 50) < 30 ? 'var(--red)' : (G.social.mediaTrust || 50) < 50 ? 'var(--yellow)' : 'var(--green)'}">${Math.round(G.social.mediaTrust || 0)}</span></div>
    <div class="economy-row"><span class="economy-label">Občianska spoločnosť</span><span class="economy-value" style="color:${(G.social.civilSociety || 50) > 60 ? 'var(--green)' : (G.social.civilSociety || 50) > 40 ? 'var(--yellow)' : 'var(--red)'}">${Math.round(G.social.civilSociety || 0)}</span></div>
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

  const wb = document.getElementById('warningBanner')!;
  const warnings: string[] = [];
  if (G.approval < 25) warnings.push('⚠️ Podpora klesla pod 25%!');
  if (G.stability < 25) warnings.push('⚠️ Stabilita vlády kriticky nízka!');
  if (G.coalition < 25) warnings.push('⚠️ Koalícia na pokraji rozpadu!');
  if (coalitionSeats() < 76) warnings.push('⚠️ Menšinová vláda! ' + coalitionSeats() + '/150 kresiel.');
  if (warnings.length) { wb.innerHTML = warnings.join('<br>'); wb.classList.add('show'); } else wb.classList.remove('show');

  // Global mood banner — visible every turn above warnings, tinted by mood.
  // Hidden when mood === 'normal' to keep the dashboard quiet.
  const mb = document.getElementById('moodBanner');
  if (mb) {
    const moodCopy: Record<typeof G.mood, { text: string; bg: string; emoji: string }> = {
      honeymoon: {
        text: `Medové týždne — prvé mesiace vlády: verejnosť je zhovievavá (+10% k podpore).`,
        bg: 'linear-gradient(90deg,rgba(74,222,128,.18),rgba(74,222,128,.05))',
        emoji: '🌸',
      },
      crisis: {
        text: `Kríza — každé rozhodnutie má zosilnené následky. Chyby bolia dvojnásobne.`,
        bg: 'linear-gradient(90deg,rgba(248,113,113,.22),rgba(248,113,113,.06))',
        emoji: '🚨',
      },
      mourning: {
        text: `Národný smútok — delivé politiky sa trestajú, jednota odmeňuje.`,
        bg: 'linear-gradient(90deg,rgba(148,163,184,.22),rgba(148,163,184,.06))',
        emoji: '🕊️',
      },
      normal: { text: '', bg: '', emoji: '' },
    };
    const c = moodCopy[G.mood];
    if (G.mood === 'normal' || !c.text) {
      mb.style.display = 'none';
      mb.innerHTML = '';
    } else {
      mb.style.display = 'block';
      mb.style.background = c.bg;
      mb.innerHTML = `<span style="font-size:1.1rem;margin-right:6px">${c.emoji}</span>${esc(c.text)}`;
    }
  }

  const mapEl = document.getElementById('dashMap');
  if (mapEl) mapEl.innerHTML = renderMap();
  const econCoalEl = document.getElementById('dashEconCoalition')!;
  econCoalEl.innerHTML = renderEconomy() + renderCoalition();
  document.getElementById('dashParliament')!.innerHTML = renderParliament();
  document.getElementById('dashStances')!.innerHTML = renderStances() + renderAdvancedMetrics();
  document.getElementById('dashDiplomacy')!.innerHTML = renderDiplomacy();
  document.getElementById('dashHistory')!.innerHTML = renderHistoryPanel();

  const instEl = document.getElementById('dashInstitutions');
  if (instEl) instEl.innerHTML = renderCourt() + renderCabinet() + renderInstitutions();
}

function renderCourt(): string {
  const G = getState();
  if (!G.court.judges.length) return '';
  const quorum = G.court.judges.length >= 7;
  const avgIdeology = G.court.judges.reduce((s, j) => s + j.ideology, 0) / G.court.judges.length;
  const avgLoyalty = G.court.judges.reduce((s, j) => s + j.loyalty, 0) / G.court.judges.length;
  const ideCol = avgIdeology > 6 ? 'var(--red)' : avgIdeology > 4 ? 'var(--yellow)' : 'var(--green)';
  const loyCol = avgLoyalty > 6 ? 'var(--green)' : avgLoyalty > 4 ? 'var(--yellow)' : 'var(--red)';
  const chair = G.court.judges.find(j => j.isChair);
  const judgeList = G.court.judges.map(j => {
    const col = j.loyalty > 6 ? 'rgba(16,185,129,.3)' : j.loyalty < 4 ? 'rgba(239,68,68,.3)' : 'rgba(255,255,255,.05)';
    return `<div style="display:flex;justify-content:space-between;padding:3px 6px;background:${col};border-radius:3px;font-size:.7rem;margin:1px 0"><span style="color:#fff">${esc(j.name)}${j.isChair ? ' ⭐' : ''}</span><span style="color:var(--text-dim)">I:${j.ideology} K:${j.competence} P:${j.conviction} L:${j.loyalty}</span></div>`;
  }).join('');
  return `<div class="dashboard-panel"><div class="panel-title">🏛️ Ústavný súd SR</div>
    <div class="economy-row"><span class="economy-label">Sudcov</span><span class="economy-value" style="color:${quorum ? 'var(--green)' : 'var(--red)'}">${G.court.judges.length}/13 ${quorum ? '✓' : '✗ pod kvórom!'}</span></div>
    <div class="economy-row"><span class="economy-label">Predseda</span><span class="economy-value">${chair ? esc(chair.name) : 'neobsadený'}</span></div>
    <div class="economy-row"><span class="economy-label">Priemerná ideológia</span><span class="economy-value" style="color:${ideCol}">${avgIdeology.toFixed(1)}</span></div>
    <div class="economy-row"><span class="economy-label">Priemerná lojalita</span><span class="economy-value" style="color:${loyCol}">${avgLoyalty.toFixed(1)}</span></div>
    <div class="economy-row"><span class="economy-label">Prestíž súdu</span><span class="economy-value" style="color:${G.court.courtPrestige > 60 ? 'var(--green)' : G.court.courtPrestige > 35 ? 'var(--yellow)' : 'var(--red)'}">${Math.round(G.court.courtPrestige)}</span></div>
    ${G.court.pendingVacancies > 0 ? `<div class="economy-row"><span class="economy-label">Voľné miesta</span><span class="economy-value" style="color:var(--red)">${G.court.pendingVacancies}</span></div>` : ''}
    <details style="margin-top:6px"><summary style="font-size:.7rem;color:var(--gold);cursor:pointer">Sudcovia (${G.court.judges.length})</summary>${judgeList}</details>
  </div>`;
}

function renderCabinet(): string {
  const G = getState();
  const era = getEra();
  if (!G.cabinet.ministers.length || !era.cabinet) return '';
  const cohCol = G.cabinet.cabinetCohesion > 60 ? 'var(--green)' : G.cabinet.cabinetCohesion > 40 ? 'var(--yellow)' : 'var(--red)';
  const avgComp = G.cabinet.ministers.reduce((s, m) => s + m.competence, 0) / G.cabinet.ministers.length;
  const compCol = avgComp > 6 ? 'var(--green)' : avgComp > 4 ? 'var(--yellow)' : 'var(--red)';
  const ministerList = G.cabinet.ministers.map(m => {
    const ministry = era.cabinet!.ministries.find(x => x.id === m.ministry);
    const scandalRisk = m.corruption > 6 ? 'var(--red)' : m.corruption > 3 ? 'var(--yellow)' : 'var(--green)';
    const loyCol = m.loyalty > 6 ? 'var(--green)' : m.loyalty > 4 ? 'var(--yellow)' : 'var(--red)';
    return `<div style="display:flex;justify-content:space-between;padding:3px 6px;background:rgba(255,255,255,.03);border-radius:3px;font-size:.7rem;margin:1px 0;border-left:3px solid ${loyCol}"><span style="color:#fff">${ministry ? ministry.emoji + ' ' : ''}${esc(m.name)}</span><span style="color:var(--text-dim)">${era.partyDisplay?.names[m.party] || m.party} | K:${m.competence} L:${m.loyalty} <span style="color:${scandalRisk}">R:${m.corruption}</span></span></div>`;
  }).join('');
  return `<div class="dashboard-panel"><div class="panel-title">🏢 Vláda SR — Kabinet</div>
    <div class="economy-row"><span class="economy-label">Súdržnosť kabinetu</span><span class="economy-value" style="color:${cohCol}">${Math.round(G.cabinet.cabinetCohesion)}%</span></div>
    <div class="economy-row"><span class="economy-label">Priemerná kompetencia</span><span class="economy-value" style="color:${compCol}">${avgComp.toFixed(1)}</span></div>
    <div class="economy-row"><span class="economy-label">Premiešania</span><span class="economy-value">${G.cabinet.reshuffleCount}</span></div>
    <details style="margin-top:6px"><summary style="font-size:.7rem;color:var(--gold);cursor:pointer">Ministri (${G.cabinet.ministers.length})</summary>${ministerList}</details>
  </div>`;
}

function renderInstitutions(): string {
  const G = getState();
  const era = getEra();
  if (!G.institutions.heads.length || !era.institutions) return '';
  const intCol = G.institutions.institutionalIntegrity > 60 ? 'var(--green)' : G.institutions.institutionalIntegrity > 35 ? 'var(--yellow)' : 'var(--red)';
  const capCol = G.institutions.capturedCount >= 4 ? 'var(--red)' : G.institutions.capturedCount >= 2 ? 'var(--yellow)' : 'var(--green)';
  const headList = G.institutions.heads.map(h => {
    const inst = era.institutions!.institutions.find(x => x.id === h.institution);
    const loyCol = h.loyalty > 6 ? 'var(--green)' : h.loyalty > 4 ? 'var(--yellow)' : 'var(--red)';
    const convCol = h.conviction > 6 ? 'var(--green)' : h.conviction > 4 ? 'var(--yellow)' : 'var(--red)';
    return `<div style="display:flex;justify-content:space-between;padding:3px 6px;background:rgba(255,255,255,.03);border-radius:3px;font-size:.7rem;margin:1px 0;border-left:3px solid ${loyCol}"><span style="color:#fff">${inst ? inst.emoji + ' ' : ''}${esc(h.name)}</span><span style="color:var(--text-dim)">${inst ? inst.name : h.institution} | L:${h.loyalty} <span style="color:${convCol}">P:${h.conviction}</span></span></div>`;
  }).join('');
  return `<div class="dashboard-panel"><div class="panel-title">🏗️ Nezávislé inštitúcie</div>
    <div class="economy-row"><span class="economy-label">Integrita inštitúcií</span><span class="economy-value" style="color:${intCol}">${Math.round(G.institutions.institutionalIntegrity)}</span></div>
    <div class="economy-row"><span class="economy-label">Ovládnuté inštitúcie</span><span class="economy-value" style="color:${capCol}">${G.institutions.capturedCount}/${G.institutions.heads.length}</span></div>
    <details style="margin-top:6px;"><summary style="font-size:.7rem;color:var(--gold);cursor:pointer">Predstavitelia (${G.institutions.heads.length})</summary>${headList}</details>
  </div>`;
}
