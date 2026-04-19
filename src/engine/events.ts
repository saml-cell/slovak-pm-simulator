import type { ActiveEvent } from './types';
import { getEra, getState } from './state';
import { esc } from './sanitize';
import { kwScore } from './scoring';

const defaultQuietMonths = [
  { h: 'Pokojný mesiac', d: 'Žiadne veľké udalosti tento mesiac. Vláda funguje v bežnom režime. Máte priestor na vlastné iniciatívy a dlhodobé plány.', c: 'Využite čas na posilnenie pozície alebo riešenie dlhodobých problémov.' },
  { h: 'Rutinný mesiac', d: 'Politická scéna je tento mesiac relatívne pokojná. Koalícia funguje bez väčších konfliktov. Opozícia pripravuje vlastné návrhy.', c: 'Ideálny čas na presadenie menších, ale dôležitých zmien.' },
  { h: 'Stabilný mesiac', d: 'Bez veľkých kríz. Ekonomika beží svojim tempom. Diplomatické vzťahy sú stabilné. Občania riešia bežné starosti.', c: 'Môžete sa sústrediť na čokoľvek — od ekonomiky po zahraničnú politiku.' },
  { h: 'Mesiac bez kríz', d: 'Tento mesiac sa nič dramatické nedeje. Slovensko žije bežným životom. Parlament sa zaoberá legislatívnou agendou.', c: 'Dobrý čas na budovanie vzťahov v koalícii alebo diplomatické iniciatívy.' },
  { h: 'Čas na stratégiu', d: 'Politická atmosféra je pokojná. Médiá sa zaoberajú bežnými témami. Koaličná rada zasadá rutinne.', c: 'Využite priestor na dlhodobé plánovanie a strategické rozhodnutia.' },
];

function getQuietMonths(): { h: string; d: string; c: string }[] {
  const era = getEra();
  return era.quietMonths || defaultQuietMonths;
}

function getEvent(m: number): ActiveEvent {
  const G = getState();
  const era = getEra();

  // Scheduled consequences due this month (or earlier — catches stale
  // entries from bugs in prior builds). Only one consequence can fire per
  // month; the rest — whether they fizzle on probability or lose the
  // first-come slot — are dropped from the queue so they don't accumulate.
  // Prior behaviour: a successful first consequence returned immediately
  // while the rest stayed in G.cq with fire <= m and never got consumed
  // (next month's filter uses fire === m+1). Over a full era those orphans
  // added up to hundreds of dead entries in memory.
  const dueCqs = G.cq.filter(c => c.fire <= m);
  G.cq = G.cq.filter(c => c.fire > m);
  for (const cq of dueCqs) {
    if (Math.random() < cq.prob) {
      // Fallback copy for consequences generated dynamically by policy
      // analysis (a.consequence) — those are pushed without a context
      // field, so without these defaults the event card rendered blank.
      // Era-authored consequenceChains include full h/d/c strings, so
      // the fallbacks only kick in for the dynamic path.
      const headline = cq.ev.h && cq.ev.h.trim()
        ? cq.ev.h
        : 'Dôsledok predchádzajúcej politiky';
      const description = cq.ev.d && cq.ev.d.trim()
        ? cq.ev.d
        : 'Vaše staršie rozhodnutie sa teraz prejavuje. Médiá si to všimli, opozícia tiež.';
      const context = cq.ev.c && cq.ev.c.trim()
        ? cq.ev.c
        : 'Premiér musí reagovať — buď problém pomenovať a prevziať zodpovednosť, alebo ho odsunúť bokom a dúfať, že sa rozpustí sám.';
      const suggestions = Array.isArray(cq.ev.s) && cq.ev.s.length
        ? cq.ev.s
        : ['Verejne prevziať zodpovednosť', 'Tlačová konferencia s hľadaním vinníkov', 'Ignorovať a presmerovať pozornosť'];
      return {
        id: 'csq_' + m,
        headline, description, context,
        tier: 'consequence',
        category: cq.ev.cat || 'Ekonomika',
        suggestions,
        originPolicy: cq.originP,
        originMonth: cq.originM,
      };
    }
  }

  const fe = era.forcedEvents.find(e => e.m === m && !G.used.has(e.id));
  if (fe) {
    G.used.add(fe.id);
    return {
      id: fe.id, headline: fe.h, description: fe.d, context: fe.c,
      tier: fe.t, category: fe.cat, suggestions: fe.s,
      scheme: fe.scheme, schemeStage: fe.schemeStage,
    };
  }

  // Quiet months get rarer as the era progresses (30% early, 10% late).
  const progress = era.totalMonths > 0 ? m / era.totalMonths : 0;
  const quietChance = Math.max(0.1, 0.3 - progress * 0.25);
  if (Math.random() < quietChance) {
    const qms = getQuietMonths();
    const q = qms[Math.floor(Math.random() * qms.length)];
    return { id: 'quiet_' + m, headline: q.h, description: q.d, context: q.c, tier: 'open', category: 'Sociálna politika', suggestions: ['Investovať do ekonomiky', 'Posilniť koalíciu', 'Zahraničná iniciatíva', 'Sociálne opatrenia'] };
  }

  const av = era.randomEvents.filter(e => !G.used.has(e.id));
  if (av.length) {
    const e = av[Math.floor(Math.random() * av.length)];
    G.used.add(e.id);
    return { id: e.id, headline: e.h, description: e.d, context: e.c, tier: e.t, category: e.cat, suggestions: e.s };
  }

  const qms = getQuietMonths();
  const q = qms[Math.floor(Math.random() * qms.length)];
  return { id: 'quiet_' + m, headline: q.h, description: q.d, context: q.c, tier: 'open', category: 'Ekonomika', suggestions: ['Ekonomické reformy', 'Sociálne opatrenia', 'Zahraničná politika', 'Investície do infraštruktúry'] };
}

export function displayEvent() {
  const G = getState();
  const ev = getEvent(G.month);
  G.event = ev;

  const el = (id: string) => document.getElementById(id)!;
  el('eventMonthNumber').textContent = String(G.month + 1);
  const totalEl = document.getElementById('eventTotalMonths');
  if (totalEl) totalEl.textContent = String(getEra().totalMonths);
  el('eventHeadline').textContent = ev.headline;
  el('eventDescription').textContent = ev.description;
  el('eventContext').textContent = ev.context;

  const tl = el('eventTierLabel');
  const tm: Record<string, string> = { situation: 'SITUÁCIA', crisis: 'KRÍZA', open: 'OTVORENÉ', consequence: 'DÔSLEDOK' };
  tl.textContent = tm[ev.tier] || ev.tier.toUpperCase();
  tl.className = `event-tier ${ev.tier}`;
  el('eventCard').className = `event-card ${ev.tier}`;

  const oe = el('eventOrigin');
  if (ev.originPolicy) {
    oe.style.display = 'block';
    oe.textContent = 'Dôsledok politiky z M' + ((ev.originMonth || 0) + 1) + ': "' + (ev.originPolicy || '').substring(0, 80) + '..."';
  } else if (ev.scheme) {
    // Scheme label: tells the player this event is part of a multi-stage
    // narrative arc. Three stages: hint (introduction), decision (turning
    // point), climax (resolution). The connective tissue is content, not
    // engine state — players notice the recurring theme across events.
    const stageCopy: Record<NonNullable<ActiveEvent['schemeStage']>, string> = {
      hint: 'Zvesti sa zatiaľ len šuškajú.',
      decision: 'Toto je bod zlomu — vaša odpoveď rozhodne o dôsledkoch.',
      climax: 'Dôsledky vašich skorších rozhodnutí dozrievajú.',
    };
    const stage = ev.schemeStage || 'hint';
    oe.style.display = 'block';
    oe.textContent = `🎭 INTRIGA — ${ev.scheme.toUpperCase()}: ${stageCopy[stage]}`;
  } else {
    oe.style.display = 'none';
  }

  // Advisor counsel: on crisis-tier events, surface 1-2 short politician
  // quotes hinting at consequences. Picked by overlap between event
  // headline keywords and politician kw_pos/kw_neg. Drawn from
  // pol.reactions.neu (advisory tone). Displayed above suggestions; on
  // non-crisis events the box stays hidden so the standard flow is
  // unchanged. This is the Suzerain "advisor counsels before decision"
  // pattern, scoped down to a small flavor strip.
  const advisorBox = document.getElementById('advisorCounsel');
  if (advisorBox) {
    if (ev.tier === 'crisis') {
      const era = getEra();
      const evText = (ev.headline + ' ' + ev.description).toLowerCase();
      const candidates = era.politicians
        .map(p => {
          const overlap = [...p.kw_pos, ...p.kw_neg].filter(k => evText.includes(k.toLowerCase())).length;
          return { p, overlap };
        })
        .filter(x => x.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 2);
      const fallback = era.politicians.slice(0, 2).map(p => ({ p, overlap: 0 }));
      const pick = candidates.length ? candidates : fallback;
      advisorBox.style.display = 'block';
      advisorBox.innerHTML = '<div style="font-size:.7rem;color:var(--gold);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Poradcovia hovoria</div>' +
        pick.map(({ p }) => {
          const quote = p.reactions.neu[Math.floor(Math.random() * p.reactions.neu.length)] || '...';
          return `<div style="display:flex;gap:10px;align-items:flex-start;padding:6px 8px;border-left:2px solid rgba(201,168,76,.3);margin-bottom:4px"><span style="font-size:1.1rem">${esc(p.emoji)}</span><div style="flex:1"><div style="font-size:.7rem;color:#fff;font-weight:600">${esc(p.name)} <span style="color:var(--text-dim);font-weight:400;font-style:italic">— ${esc(p.role)}</span></div><div style="font-size:.75rem;color:var(--text-dim);font-style:italic;margin-top:2px">"${esc(quote)}"</div></div></div>`;
        }).join('');
    } else {
      advisorBox.style.display = 'none';
      advisorBox.innerHTML = '';
    }
  }

  el('suggestionsContainer').innerHTML = ev.suggestions.map(s =>
    `<div class="suggestion-chip" onclick="document.getElementById('policyInput').value=this.textContent;window.__updateCC()">${esc(s)}</div>`
  ).join('');

  (el('policyInput') as HTMLTextAreaElement).value = '';
  updateCC();
  (el('submitPolicyButton') as HTMLButtonElement).disabled = true;
  const spinInput = document.getElementById('spinInput') as HTMLTextAreaElement | null;
  if (spinInput) spinInput.value = '';
  const spinSection = document.getElementById('spinSection');
  if (spinSection) spinSection.style.display = 'none';
  const preview = document.getElementById('policyPreview');
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
}

export function updateCC() {
  const n = (document.getElementById('policyInput') as HTMLTextAreaElement).value.length;
  const cc = document.getElementById('charCount')!;
  cc.textContent = n + ' / 2000';
  (document.getElementById('submitPolicyButton') as HTMLButtonElement).disabled = n < 10;
  cc.className = 'char-count' + (n < 10 ? ' error' : '');
  schedulePreview();
}

// Debounced policy preview. Runs kwScore on the current textarea content
// ~300 ms after the last keystroke and renders a one-line summary of the
// predicted parliament/court/president check, approval/stability/coalition
// deltas, and the three biggest stakeholder shifts. Only surfaces when the
// policy is ≥ 30 chars — below that the signal is mostly noise. The result
// is advisory; the actual submitted analysis re-runs kwScore server-side
// in the analysis screen.
let previewTimer: number | null = null;

function schedulePreview(): void {
  if (previewTimer !== null) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderPolicyPreview, 300);
}

function renderPolicyPreview(): void {
  const ta = document.getElementById('policyInput') as HTMLTextAreaElement | null;
  const box = document.getElementById('policyPreview');
  if (!ta || !box) return;
  const policy = ta.value.trim();
  if (policy.length < 30) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  // kwScore is a pure function over (era, state, policy). Running it for
  // preview does not mutate game state — the result is discarded.
  const a = kwScore(policy);

  const color = (v: number) => v >= 70 ? 'var(--green)' : v >= 40 ? 'var(--yellow)' : 'var(--red)';
  const signColor = (v: number) => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-dim)';
  const sign = (v: number) => (v > 0 ? '+' : '') + v;

  // Top 3 stakeholder shifts (biggest absolute delta from baseline 50).
  const era = getEra();
  const shifts = Object.entries(a.sScores)
    .map(([id, v]) => {
      const name = era.stakeholders.find(s => s.id === id)?.name || id;
      return { id, name, delta: Math.round(v - 50) };
    })
    .filter(x => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  const shiftsHtml = shifts.length
    ? shifts.map(s => `<span style="color:${signColor(s.delta)}">${esc(s.name)} ${sign(s.delta)}</span>`).join(' · ')
    : '<span style="color:var(--text-dim)">žiadne výrazné posuny</span>';

  const overall =
    `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px">
      <span>📊 <strong>Predpokladaný dopad</strong> <span style="color:var(--text-dim);font-size:.7rem">(reálne po odoslaní)</span></span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px">
      <span>Parlament <strong style="color:${color(a.cb.parliament)}">${a.cb.parliament}</strong>/100</span>
      <span>Súd <strong style="color:${color(a.cb.court)}">${a.cb.court}</strong></span>
      <span>Prezident <strong style="color:${color(a.cb.president)}">${a.cb.president}</strong></span>
      <span>Implementácia <strong style="color:${color(a.cb.implementationRate || 80)}">${a.cb.implementationRate || 80}%</strong></span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px">
      <span>Podpora <strong style="color:${signColor(a.aD)}">${sign(a.aD)}</strong></span>
      <span>Stabilita <strong style="color:${signColor(a.stD)}">${sign(a.stD)}</strong></span>
      <span>Koalícia <strong style="color:${signColor(a.cD)}">${sign(a.cD)}</strong></span>
    </div>
    <div>Kľúčové presuny: ${shiftsHtml}</div>`;

  box.style.display = 'block';
  box.innerHTML = overall;
}

// Exposed on window for inline onclick handlers in generated HTML.
window.__updateCC = updateCC;
