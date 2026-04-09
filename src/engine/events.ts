import type { ActiveEvent } from './types';
import { getEra, getState, getCalendarDate } from './state';
import { esc } from './sanitize';

const defaultQuietMonths = [
  { h: 'Pokojný mesiac', d: 'Žiadne veľké udalosti tento mesiac. Vláda funguje v bežnom režime. Máte priestor na vlastné iniciatívy a dlhodobé plány.', c: 'Využite čas na posilnenie pozície alebo riešenie dlhodobých problémov.' },
  { h: 'Rutinný mesiac', d: 'Politická scéna je tento mesiac relatívne pokojná. Koalícia funguje bez väčších konfliktov. Opozícia pripravuje vlastné návrhy.', c: 'Ideálny čas na presadenie menších, ale dôležitých zmien.' },
  { h: 'Stabilný mesiac', d: 'Bez veľkých kríz. Ekonomika beží svojim tempom. Diplomatické vzťahy sú stabilné. Občania riešia bežné starosti.', c: 'Môžete sa sústrediť na čokoľvek — od ekonomiky po zahraničnú politiku.' },
  { h: 'Mesiac bez kríz', d: 'Tento mesiac sa nič dramatické nedeje. Slovensko žije bežným životom. Parlament sa zaoberá legislatívnou agendou.', c: 'Dobrý čas na budovanie vzťahov v koalícii alebo diplomatické iniciatívy.' },
  { h: 'Čas na stratégiu', d: 'Politická atmosféra je pokojná. Médiá sa zaoberajú bežnými témami. Koaličná rada zasadá rutinne.', c: 'Využite priestor na dlhodobé plánovanie a strategické rozhodnutia.' },
];

function getQuietMonths(): { h: string; d: string; c: string }[] {
  const era = getEra();
  return (era as unknown as Record<string, unknown>).quietMonths as typeof defaultQuietMonths || defaultQuietMonths;
}

export function getEvent(m: number): ActiveEvent {
  const G = getState();
  const era = getEra();

  // Check consequence queue — try all consequences scheduled for this month
  const cqs = G.cq.filter(c => c.fire === m);
  for (const cq of cqs) {
    if (Math.random() < cq.prob) {
      G.cq = G.cq.filter(c => c !== cq);
      return {
        id: 'csq_' + m,
        headline: cq.ev.h || cq.ev.headline || '',
        description: cq.ev.d || cq.ev.description || '',
        context: cq.ev.c || cq.ev.context || '',
        tier: 'consequence',
        category: cq.ev.cat || 'Ekonomika',
        suggestions: cq.ev.s || cq.ev.suggestions || ['Riešiť', 'Ignorovať', 'Kompromis'],
        originPolicy: cq.originP,
        originMonth: cq.originM,
      };
    }
    // Probability check failed — remove this consequence
    G.cq = G.cq.filter(c => c !== cq);
  }

  // Check forced events
  const fe = era.forcedEvents.find(e => e.m === m && !G.used.has(e.id));
  if (fe) {
    G.used.add(fe.id);
    return { id: fe.id, headline: fe.h, description: fe.d, context: fe.c, tier: fe.t, category: fe.cat, suggestions: fe.s };
  }

  // Quiet month chance decreases as game progresses (30% early → 10% late)
  const progress = era.totalMonths > 0 ? m / era.totalMonths : 0;
  const quietChance = Math.max(0.1, 0.3 - progress * 0.25);
  if (Math.random() < quietChance) {
    const qms = getQuietMonths();
    const q = qms[Math.floor(Math.random() * qms.length)];
    return { id: 'quiet_' + m, headline: q.h, description: q.d, context: q.c, tier: 'open', category: 'Sociálna politika', suggestions: ['Investovať do ekonomiky', 'Posilniť koalíciu', 'Zahraničná iniciatíva', 'Sociálne opatrenia'] };
  }

  // Random events
  const av = era.randomEvents.filter(e => !G.used.has(e.id));
  if (av.length) {
    const e = av[Math.floor(Math.random() * av.length)];
    G.used.add(e.id);
    return { id: e.id, headline: e.h, description: e.d, context: e.c, tier: e.t, category: e.cat, suggestions: e.s };
  }

  // Fallback quiet
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
  } else {
    oe.style.display = 'none';
  }

  el('suggestionsContainer').innerHTML = (ev.suggestions || []).map(s =>
    `<div class="suggestion-chip" onclick="document.getElementById('policyInput').value=this.textContent;window.__updateCC()">${esc(s)}</div>`
  ).join('');

  (el('policyInput') as HTMLTextAreaElement).value = '';
  updateCC();
  (el('submitPolicyButton') as HTMLButtonElement).disabled = true;
  const spinInput = document.getElementById('spinInput') as HTMLTextAreaElement | null;
  if (spinInput) spinInput.value = '';
  const spinSection = document.getElementById('spinSection');
  if (spinSection) spinSection.style.display = 'none';
}

export function updateCC() {
  const n = (document.getElementById('policyInput') as HTMLTextAreaElement).value.length;
  const cc = document.getElementById('charCount')!;
  cc.textContent = n + ' / 2000';
  (document.getElementById('submitPolicyButton') as HTMLButtonElement).disabled = n < 10;
  cc.className = 'char-count' + (n < 10 ? ' error' : '');
}

// Expose for inline onclick handlers
(window as unknown as Record<string, unknown>).__updateCC = updateCC;
