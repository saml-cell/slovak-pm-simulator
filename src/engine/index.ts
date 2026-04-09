import '../styles/main.css';
import { loadEra } from './loader';
import { setEra, initGame, initCalendar, getState } from './state';
import { showScreen } from './screen';
import { displayEvent, updateCC } from './events';
import { analyze } from './analysis';
import { showAnalysis, showFG, showSH } from './render/analysis-view';
import { updateDash } from './render/dashboard';
import { proceed, confirmResign } from './game-flow';
import { openHistory, generateWiki } from './wiki';
import { trackAnalytics } from './analytics';
import type { GameState } from './types';

async function main() {
  const params = new URLSearchParams(window.location.search);
  const eraId = params.get('era') || 'fico-2023-present';

  // Load era config
  const era = await loadEra(eraId);
  setEra(era);
  initCalendar(era.calendar);

  // Populate title screen
  document.getElementById('titleSubtitle')!.textContent = era.titleScreen.subtitle;
  document.getElementById('titleDesc')!.textContent = era.titleScreen.description;
  document.getElementById('startButton')!.textContent = era.titleScreen.startButtonText;

  // Settings toggle
  document.getElementById('settingsToggle')!.addEventListener('click', () => {
    document.getElementById('settingsPanel')!.classList.toggle('open');
  });

  // AI provider
  const aiSelect = document.getElementById('aiProviderSelect') as HTMLSelectElement;
  aiSelect.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    sessionStorage.setItem('ai_provider', v);
    document.getElementById('apiKeyGroup')!.style.display = (v === 'groq' || v === 'anthropic') ? 'block' : 'none';
    document.getElementById('groqHelp')!.style.display = v === 'groq' ? 'block' : 'none';
    document.getElementById('anthropicHelp')!.style.display = v === 'anthropic' ? 'block' : 'none';
    const active = v !== 'none';
    document.getElementById('aiIndicator')!.classList.toggle('active', active);
    document.getElementById('aiIndicator2')!.classList.toggle('active', active);
    document.getElementById('aiIndicator')!.textContent = v === 'puter' ? 'AI: Puter.js (zadarmo)' : v === 'groq' ? 'AI: Groq' : v === 'anthropic' ? 'AI: Anthropic' : 'Lokálne';
  });

  document.getElementById('apiKeyInput')!.addEventListener('change', (e) => {
    const k = (e.target as HTMLInputElement).value.trim();
    if (k) sessionStorage.setItem('ai_api_key', k);
    else sessionStorage.removeItem('ai_api_key');
  });

  // Init provider from session
  const savedProvider = sessionStorage.getItem('ai_provider') || 'none';
  aiSelect.value = savedProvider;
  document.getElementById('apiKeyGroup')!.style.display = (savedProvider === 'groq' || savedProvider === 'anthropic') ? 'block' : 'none';
  document.getElementById('groqHelp')!.style.display = savedProvider === 'groq' ? 'block' : 'none';
  document.getElementById('anthropicHelp')!.style.display = savedProvider === 'anthropic' ? 'block' : 'none';
  if (savedProvider !== 'none') {
    document.getElementById('aiIndicator')!.classList.add('active');
    document.getElementById('aiIndicator')!.textContent = savedProvider === 'puter' ? 'AI: Puter.js (zadarmo)' : savedProvider === 'groq' ? 'AI: Groq' : 'AI: Anthropic';
  }

  // Start button
  document.getElementById('startButton')!.addEventListener('click', () => {
    initGame();
    // Try to restore save
    const raw = localStorage.getItem(era.meta.saveKey);
    if (raw) {
      try {
        const sv = JSON.parse(raw);
        // Validate save data structure before restoring
        if (sv && typeof sv === 'object' && sv.econ && typeof sv.econ.gdp === 'number'
            && typeof sv.month === 'number' && typeof sv.approval === 'number'
            && typeof sv.stability === 'number' && typeof sv.coalition === 'number') {
          sv.used = new Set(Array.isArray(sv.used) ? sv.used.filter((x: unknown) => typeof x === 'string') : []);
          const G = getState();
          // Only restore known safe keys
          const safeKeys: (keyof GameState)[] = ['month', 'approval', 'stability', 'coalition', 'impl',
            'prevA', 'prevS', 'prevC', 'prevImpl', 'history', 'approvalH', 'pScores', 'sScores',
            'econ', 'diplo', 'social', 'cp', 'parl', 'flags', 'cq', 'used',
            'pellegrini', 'stances',
            'momentum', 'policyThemes', 'oppositionPressure',
            'businessCycle', 'politicalCapital', 'crisisFatigue', 'euFundsFlow',
            'debtToGdp', 'fdi', 'mediaCycle', 'mediaCycleEvent', 'pollApproval', 'pollError', 'interestRate', 'laborParticipation', 'shapleyPower'];
          for (const key of safeKeys) {
            if (key in sv) (G as unknown as Record<string, unknown>)[key] = sv[key];
          }
        } else {
          localStorage.removeItem(era.meta.saveKey);
        }
      } catch (_e) {
        localStorage.removeItem(era.meta.saveKey);
      }
    }
    updateDash();
    showScreen('dashboardScreen');
  });

  // Navigation
  document.getElementById('backToMenuBtn')!.addEventListener('click', () => {
    window.location.href = './';
  });
  document.getElementById('historyBtn')!.addEventListener('click', () => openHistory());
  document.getElementById('resignBtn')!.addEventListener('click', () => {
    document.getElementById('resignModal')!.classList.add('active');
  });
  document.getElementById('confirmResignBtn')!.addEventListener('click', () => confirmResign());
  document.getElementById('cancelResignBtn')!.addEventListener('click', () => {
    document.getElementById('resignModal')!.classList.remove('active');
  });

  // Game flow
  document.getElementById('playButton')!.addEventListener('click', () => {
    displayEvent();
    showScreen('eventScreen');
  });
  document.getElementById('policyInput')!.addEventListener('input', updateCC);
  let analyzing = false;
  document.getElementById('submitPolicyButton')!.addEventListener('click', async () => {
    if (analyzing) return;
    const G = getState();
    const p = (document.getElementById('policyInput') as HTMLTextAreaElement).value;
    if (p.length < 10) return;
    analyzing = true;
    (document.getElementById('submitPolicyButton') as HTMLButtonElement).disabled = true;
    const spin = ((document.getElementById('spinInput') as HTMLTextAreaElement)?.value || '').trim();
    G.history.push({ m: G.month, p, spin, ev: G.event ? G.event.headline || '' : '' });
    const a = await analyze(G.event, p);
    // Spin bonus (subtle — good framing helps but can't save bad policy)
    if (spin.length > 5) {
      const spinLow = spin.toLowerCase();
      const spinPositive = ['ochrana', 'moderniz', 'investic', 'rozvoj', 'budúcnosť', 'rast', 'stabilit', 'bezpečn', 'rodina', 'práca', 'zamestnan', 'prosperit', 'reform', 'zlepš', 'podpora', 'pomoc', 'inováci', 'pokrok', 'spravodliv'];
      let spinBonus = 0;
      spinPositive.forEach(k => { if (spinLow.includes(k)) spinBonus += 0.5; });
      spinBonus = Math.min(spinBonus, 2);
      if (spinBonus > 0) {
        a.aD += spinBonus;
        Object.keys(a.pScores).forEach(id => { a.pScores[id] = Math.min(95, (a.pScores[id] || 50) + spinBonus * 0.3); });
      }
    }
    showAnalysis(a);
    showFG(a);
    showSH(a);
    analyzing = false;
    showScreen('analysisScreen');
  });

  // Spin toggle
  document.getElementById('spinToggle')!.addEventListener('click', () => {
    const sec = document.getElementById('spinSection')!;
    sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
  });

  // Analysis navigation
  document.getElementById('continueButton')!.addEventListener('click', () => showScreen('focusGroupScreen'));
  document.getElementById('backToAnalysisButton')!.addEventListener('click', () => showScreen('analysisScreen'));
  document.getElementById('continueFromFGButton')!.addEventListener('click', () => showScreen('stakeholderScreen'));
  document.getElementById('backToFGButton')!.addEventListener('click', () => showScreen('focusGroupScreen'));
  document.getElementById('continueFromStakeholderButton')!.addEventListener('click', () => {
    const G = getState();
    if (G.analysis) proceed(G.analysis);
  });
  document.getElementById('backFromEventButton')!.addEventListener('click', () => showScreen('dashboardScreen'));

  // Game over
  document.getElementById('playAgainButton')!.addEventListener('click', () => location.reload());
  document.getElementById('wikiButton')!.addEventListener('click', () => generateWiki());

  // History modal close
  document.getElementById('closeHistoryBtn')!.addEventListener('click', () => {
    document.getElementById('historyModal')!.classList.remove('active');
  });

  // Bug report
  document.getElementById('bugReportBtn')!.addEventListener('click', () => {
    document.getElementById('bugReportModal')!.classList.add('active');
  });
  document.getElementById('closeBugReportBtn')!.addEventListener('click', () => {
    document.getElementById('bugReportModal')!.classList.remove('active');
  });
  document.getElementById('cancelBugBtn')!.addEventListener('click', () => {
    document.getElementById('bugReportModal')!.classList.remove('active');
  });
  document.getElementById('submitBugBtn')!.addEventListener('click', () => {
    const bugType = (document.getElementById('bugType') as HTMLSelectElement).value;
    const bugDesc = (document.getElementById('bugDescription') as HTMLTextAreaElement).value.trim();
    if (!bugDesc) return;
    const G = getState();
    const bugReport = {
      type: bugType,
      description: bugDesc,
      era: eraId,
      month: G.month,
      approval: G.approval,
      stability: G.stability,
      coalition: G.coalition,
      event: G.event?.headline || null,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    };
    const existing = JSON.parse(localStorage.getItem('spm_bug_reports') || '[]');
    existing.push(bugReport);
    localStorage.setItem('spm_bug_reports', JSON.stringify(existing));
    const status = document.getElementById('bugSubmitStatus')!;
    status.style.display = 'block';
    status.textContent = 'Chyba bola uložená. Ďakujeme!';
    (document.getElementById('bugDescription') as HTMLTextAreaElement).value = '';
    setTimeout(() => {
      status.style.display = 'none';
      document.getElementById('bugReportModal')!.classList.remove('active');
    }, 2000);
  });

  // Analytics tracking
  trackAnalytics('game_start', { era: eraId });
}

main().catch(err => {
  console.error('Failed to initialize game:', err);
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'color:red;padding:40px;text-align:center';
  const h1 = document.createElement('h1');
  h1.textContent = 'Chyba pri načítaní hry';
  const p = document.createElement('p');
  p.textContent = err.message;
  errDiv.appendChild(h1);
  errDiv.appendChild(p);
  document.body.innerHTML = '';
  document.body.appendChild(errDiv);
});
