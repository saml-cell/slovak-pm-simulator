// Interactive first-play tutorial. A sequence of popover cards explains
// each game system. Completion is persisted to localStorage so the
// tutorial runs exactly once per browser.
//
// Design constraints:
//  - No new dependencies; pure DOM manipulation
//  - Mobile-first: fixed-position card, full-width on narrow screens
//  - Skippable at any step (big X)
//  - Highlights target element via a semi-transparent overlay with a cut-out
//  - Works across both screens (title + dashboard)

const STORAGE_KEY = 'pm_sim_tutorial_done_v1';

interface TutorialStep {
  title: string;
  body: string;
  targetSelector?: string;  // optional CSS selector to highlight
  showOn?: 'title' | 'dashboard' | 'any';
}

const STEPS: TutorialStep[] = [
  {
    title: '👋 Vitajte v Slovak PM Simulator',
    body: 'Ste predsedom vlády SR počas jedného z deviatich historických období. Každé rozhodnutie sa ráta. Nudné nebude.',
    showOn: 'any',
  },
  {
    title: '📅 Kalendár a udalosti',
    body: 'Každý mesiac dostanete udalosť (krízu, príležitosť alebo pokojný mesiac). Musíte na ňu reagovať politikou. Obdobie trvá 24-60 mesiacov podľa éry.',
    targetSelector: '#eventCard',
    showOn: 'any',
  },
  {
    title: '✍️ Vlastná politika',
    body: 'Napíšte čo chcete — od "zvýšim minimálnu mzdu" po "tajne vyjednám s Ruskom". Motor rozumie prirodzenej slovenčine vrátane diakritiky a negácií ("zruším X" = opak "podporím X").',
    targetSelector: '#policyInput',
    showOn: 'any',
  },
  {
    title: '📊 Predpokladaný dopad',
    body: 'Ako píšete, pod políčkom sa objaví predikcia — Parlament/Súd/Prezident kontroly a kľúčové presuny stakeholderov. Vidíte dopad ešte pred odoslaním.',
    targetSelector: '#policyPreview',
    showOn: 'any',
  },
  {
    title: '🏛️ Parlament: 76/150',
    body: 'Potrebujete najmenej 76 kresiel aby ste prehlasovali zákon. Koaličné strany vám dajú väčšinu — opozícia vás bude blokovať. Ústavné zmeny potrebujú 90.',
    targetSelector: '#dashParliament',
    showOn: 'dashboard',
  },
  {
    title: '🤝 Koalícia: partneri, ktorí ohrozia vládu',
    body: 'Koalícia je srdce vlády. Keď spokojnosť partnera klesne pod 40, tajne rokuje o odchode. Ich požiadavky riešite priamo alebo odmietnete. Vyhadzovať partnerov je drahé: stratíte kresiel + −25 stabilita.',
    targetSelector: '#dashEconCoalition',
    showOn: 'dashboard',
  },
  {
    title: '⚙️ Politický kapitál (PC)',
    body: 'Získavate ho za pokojné mesiace a úspechy. Miniete ho za veľké akcie: prijatie signátového zákona (30 PC), nominácia sudcu (25 PC), výmena ministra (20 PC), tajné akcie (10-30 PC). Bez PC sú vaše politiky slabšie.',
    targetSelector: '#dashStances',
    showOn: 'dashboard',
  },
  {
    title: '📜 Signátové zákony',
    body: 'Jeden trvalý zákon za celé obdobie — nezrušiteľný. Každý má mesačný modifikátor podpory/stability/koalície. Napríklad rovná daň 19% zlepší HDP ale zníži podporu chudobnejších.',
    targetSelector: '#dashInstitutions',
    showOn: 'dashboard',
  },
  {
    title: '⚖️ Ústavný súd, Kabinet, Inštitúcie',
    body: 'Súd blokuje kontroverzné zákony — nominujte lojálnych sudcov. Kabinet implementuje zákony — vymieňajte nekompetentných. Nezávislé inštitúcie môžete ovplyvniť, ale EÚ si všíma.',
    targetSelector: '#dashInstitutions',
    showOn: 'dashboard',
  },
  {
    title: '🕵️ Tajné akcie a intrigy',
    body: 'Môžete uniknúť spis novinárom, objednať prieskum, alebo tajne dohodnúť s oligarchom. Každá akcia má riziko expozície — ak sa prevalí, klesne vám podpora.',
    targetSelector: '#dashInstitutions',
    showOn: 'dashboard',
  },
  {
    title: '🎯 Cieľ: prežiť a zmeniť Slovensko',
    body: 'Prežili ste tutoriál. Teraz vyberte obdobie a začnite. Obdobia môžete skúšať opakovane — každý prechod má iné rozhodnutia a iné zakončenie.',
    showOn: 'any',
  },
];

function isTutorialDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch { /* ignore */ }
}

let currentIdx = 0;

function renderStep(): void {
  const step = STEPS[currentIdx];
  if (!step) { finish(); return; }
  // If step requires dashboard but we're on title, skip
  const dashboardVisible = document.getElementById('dashboardScreen')?.classList.contains('active');
  if (step.showOn === 'dashboard' && !dashboardVisible) { currentIdx++; renderStep(); return; }
  if (step.showOn === 'title' && dashboardVisible) { currentIdx++; renderStep(); return; }

  const overlay = document.getElementById('tutorialOverlay') || createOverlay();
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;pointer-events:auto"></div>
    <div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);max-width:520px;width:calc(100% - 32px);background:rgba(10,14,20,.98);border:2px solid rgba(224,184,74,.4);border-radius:12px;padding:18px 20px;z-index:9999;box-shadow:0 10px 40px rgba(0,0,0,.5)">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;margin-bottom:10px">
        <div style="font-size:1rem;font-weight:700;color:var(--gold);line-height:1.3">${step.title}</div>
        <button id="tutorialSkip" style="background:transparent;color:var(--text-dim);border:0;font-size:1.3rem;cursor:pointer;padding:0 4px;line-height:1" title="Preskočiť tutoriál">×</button>
      </div>
      <div style="font-size:.85rem;color:#e4e4e7;line-height:1.55;margin-bottom:14px">${step.body}</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:.7rem;color:var(--text-dim)">Krok ${currentIdx + 1} / ${STEPS.length}</div>
        <div style="display:flex;gap:6px">
          ${currentIdx > 0 ? `<button id="tutorialPrev" style="background:rgba(255,255,255,.06);color:#fff;border:0;border-radius:4px;padding:6px 14px;font-size:.8rem;cursor:pointer">Späť</button>` : ''}
          <button id="tutorialNext" style="background:var(--gold);color:#1a1a1a;border:0;border-radius:4px;padding:6px 16px;font-size:.8rem;font-weight:700;cursor:pointer">${currentIdx === STEPS.length - 1 ? 'Dokončiť' : 'Ďalej →'}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('tutorialSkip')?.addEventListener('click', finish);
  document.getElementById('tutorialNext')?.addEventListener('click', () => {
    if (currentIdx === STEPS.length - 1) finish();
    else { currentIdx++; renderStep(); }
  });
  document.getElementById('tutorialPrev')?.addEventListener('click', () => {
    if (currentIdx > 0) { currentIdx--; renderStep(); }
  });

  // Highlight target if any
  if (step.targetSelector) {
    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '3px solid var(--gold)';
      el.style.outlineOffset = '4px';
      el.style.transition = 'outline .2s';
      setTimeout(() => {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }, 3000);
    }
  }
}

function createOverlay(): HTMLElement {
  const div = document.createElement('div');
  div.id = 'tutorialOverlay';
  document.body.appendChild(div);
  return div;
}

function finish(): void {
  markDone();
  const overlay = document.getElementById('tutorialOverlay');
  if (overlay) overlay.remove();
}

export function maybeStartTutorial(): void {
  if (isTutorialDone()) return;
  currentIdx = 0;
  renderStep();
}

// Expose a manual-start trigger so Sam can re-run it for play-testing.
// Not on Window by default to keep the namespace clean — call via
// `(window as any).__startTutorial()` from the console.
(window as unknown as { __startTutorial: () => void }).__startTutorial = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  currentIdx = 0;
  renderStep();
};

// Trigger screen-transition detection: when the user moves from title
// to dashboard, surface the dashboard-specific steps. Implemented by
// watching class changes on dashboardScreen.
export function observeScreenChanges(): void {
  const dash = document.getElementById('dashboardScreen');
  if (!dash) return;
  const obs = new MutationObserver(() => {
    if (isTutorialDone()) return;
    if (dash.classList.contains('active')) {
      // Re-trigger next step if we're waiting on dashboard visibility
      renderStep();
    }
  });
  obs.observe(dash, { attributes: true, attributeFilter: ['class'] });
}
