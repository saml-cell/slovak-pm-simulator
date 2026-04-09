import { getEra, getState, getCalendarDate } from './state';
import { esc } from './sanitize';

export function openHistory() {
  const G = getState();
  const list = document.getElementById('historyList')!;
  if (!G.history.length) {
    list.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px">Zatiaľ žiadne rozhodnutia.</p>';
    document.getElementById('historyModal')!.classList.add('active');
    return;
  }
  list.innerHTML = G.history.map((h, i) => {
    const appr = G.approvalH[i + 1] !== undefined ? Math.round(G.approvalH[i + 1]) : '--';
    const col = typeof appr === 'number' ? (appr > 60 ? 'var(--green)' : appr > 40 ? 'var(--yellow)' : 'var(--red)') : 'var(--text-dim)';
    return `<div style="padding:12px;border-bottom:1px solid var(--card-border);display:flex;gap:12px;align-items:flex-start"><div style="min-width:48px;text-align:center"><div style="font-size:1.1rem;font-weight:700;font-family:var(--mono);color:var(--gold)">M${h.m + 1}</div><div style="font-size:.65rem;color:var(--text-dim)">${esc(getCalendarDate(h.m))}</div></div><div style="flex:1"><div style="font-size:.85rem;font-weight:600;color:#fff;margin-bottom:4px">${esc(h.ev || 'Udalosť')}</div><div style="font-size:.8rem;color:var(--text-dim);line-height:1.5">${esc(h.p.substring(0, 150))}${h.p.length > 150 ? '...' : ''}</div>${h.spin ? '<div style="font-size:.7rem;color:var(--gold);margin-top:4px">Spin: ' + esc(h.spin) + '</div>' : ''}</div><div style="min-width:40px;text-align:center"><div style="font-size:1rem;font-weight:700;font-family:var(--mono);color:${col}">${appr}</div><div style="font-size:.6rem;color:var(--text-dim)">%</div></div></div>`;
  }).join('');
  document.getElementById('historyModal')!.classList.add('active');
}

export function generateWiki() {
  const G = getState();
  const era = getEra();
  const startDate = getCalendarDate(0);
  const endDate = getCalendarDate(G.month);
  const avgAppr = G.approvalH.length ? Math.round(G.approvalH.reduce((a, b) => a + b, 0) / G.approvalH.length) : 50;
  const policies = G.history.map((h) => `<li><strong>M${h.m + 1} (${esc(getCalendarDate(h.m))}):</strong> ${esc(h.ev || 'Udalosť')} — ${esc(h.p.substring(0, 100))}${h.p.length > 100 ? '...' : ''}</li>`).join('');
  const stanceDesc = Object.entries(G.stances).map(([k, v]) => {
    const labels: Record<string, string> = { ekonomika: 'Ekonomika', eu: 'EÚ/NATO', rusko: 'Rusko', social: 'Sociálna politika', media: 'Média', justicia: 'Justícia', migracia: 'Migrácia', identita: 'Národná identita' };
    const dir = v > 1 ? 'výrazne doprava' : v > 0 ? 'mierne doprava' : v < -1 ? 'výrazne doľava' : v < 0 ? 'mierne doľava' : 'stred';
    return (labels[k] || k) + ': ' + dir;
  }).join(', ');
  const diploSummary = Object.entries(G.diplo).slice(0, 4).map(([k, v]) => {
    const names: Record<string, string> = { eu: 'EÚ', usa: 'USA', russia: 'Rusko', ukraine: 'Ukrajina' };
    return (names[k] || k) + ': ' + Math.round(v) + '/100';
  }).join(', ');

  const html = `<div style="max-width:600px;margin:0 auto;font-family:var(--serif);line-height:1.8">
    <h2 style="border-bottom:2px solid var(--gold);padding-bottom:8px;color:var(--gold)">${era.meta.pmName} (premiér, ${startDate} - ${endDate})</h2>
    <p style="color:var(--text-dim);font-size:.9rem">${era.meta.pmName} vládol ako predseda vlády Slovenskej republiky od ${startDate} do ${endDate}, celkovo ${G.month} mesiacov.</p>
    <h3 style="color:#fff;margin-top:16px">Priemerná podpora</h3>
    <p style="color:var(--text-dim);font-size:.9rem">Priemerná podpora: <strong style="color:var(--gold)">${avgAppr}%</strong>. Najvyššia: ${Math.round(Math.max(...G.approvalH))}%, najnižšia: ${Math.round(Math.min(...G.approvalH))}%.</p>
    <h3 style="color:#fff;margin-top:16px">Kľúčové rozhodnutia</h3>
    <ol style="color:var(--text-dim);font-size:.85rem;padding-left:20px">${policies || '<li>Žiadne.</li>'}</ol>
    <h3 style="color:#fff;margin-top:16px">Politický profil</h3>
    <p style="color:var(--text-dim);font-size:.9rem">${stanceDesc}</p>
    <h3 style="color:#fff;margin-top:16px">Ekonomický odkaz</h3>
    <p style="color:var(--text-dim);font-size:.9rem">HDP: ${G.econ.gdp.toFixed(1)} ${era.meta.currencyBig || 'mld EUR'}, Rast: ${G.econ.gdpGrowth.toFixed(1)}%, Inflácia: ${G.econ.infl.toFixed(1)}%, Nezamestnanosť: ${G.econ.unemp.toFixed(1)}%</p>
    <h3 style="color:#fff;margin-top:16px">Diplomatické vzťahy</h3>
    <p style="color:var(--text-dim);font-size:.9rem">${diploSummary}</p>
  </div>`;

  document.getElementById('historyList')!.innerHTML = html;
  const modalTitle = document.querySelector('#historyModal h3');
  if (modalTitle) modalTitle.textContent = 'Wikipedia — ' + era.meta.pmName;
  document.getElementById('historyModal')!.classList.add('active');
}
