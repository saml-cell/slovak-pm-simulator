import type { ActiveEvent, AnalysisResult } from './types';
import { getEra, getState } from './state';
import { callAI, getAIProvider } from './ai';
import { kwScore } from './scoring';

function getSystemPrompt(): string {
  const era = getEra();
  const G = getState();
  const personaIds = era.personas.map(p => `"${p.id}":0-100`).join(',');
  const stakeholderIds = era.stakeholders.map(s => `"${s.id}":0-100`).join(',');
  const diploIds = era.diplomacy.map(d => `"${d.key}":delta`).join(',');
  const cpDesc = era.coalitionPartners.map(cp => `${cp.name}(${cp.seats})`).join('+');
  const totalSeats = era.coalitionPartners.reduce((s, cp) => s + cp.seats, 0);

  return `You are the game engine for "Slovak Prime Minister Simulator." Player is ${era.meta.pmName}, PM of Slovakia.
Given event+policy, return ONLY valid JSON:
{"category":"...","civilService":{"summary":"2-3 sentences SK","risk":"Low/Medium/High","treasuryCost":"Low/Medium/High","growthPotential":"Low/Medium/High","complexity":"Low/Medium/High","publicSensitivity":"Low/Medium/High","recommendation":"1-2 sentences SK"},
"press":{"left":{"headline":"..SK","subhead":"..SK 2-3 sentences"},"center":{"headline":"..SK","subhead":"..SK 2-3 sentences"},"right":{"headline":"..SK","subhead":"..SK 2-3 sentences"}},
"personaScores":{${personaIds}},
"stakeholderScores":{${stakeholderIds}},
"economyEffects":{"gdp":delta,"gdpGrowth":delta,"unemp":delta,"infl":delta,"deficit":delta,"debt":delta},
"diplomacyChanges":{${diploIds}},
"approvalDelta":-15to15,"stabilityDelta":-15to15,"coalitionDelta":-15to15,
"checksAndBalances":{"parliament":0-100,"court":0-100,"president":0-100,"implementationRate":0-100},
"consequence":null or {"headline":"SK","description":"SK","delay":2-6,"probability":0.3-1.0},
"flags":{},"socialEffects":{"press":d,"corrupt":d}}
Coalition:${cpDesc}=${totalSeats}/150.${G.pellegrini && era.meta.presidentFriendly ? ` ${era.meta.presidentFriendly} is president (friendly).` : era.meta.presidentName ? ` ${era.meta.presidentName} is president.` : ''}
Stakeholders: ${era.stakeholders.map(s => s.name).join(', ')}.
All text Slovak with proper diacritics. Be realistic and harsh.`;
}

function parseAIResult(raw: Record<string, unknown>): AnalysisResult {
  const r = raw as Record<string, unknown>;
  return {
    aD: (r.approvalDelta as number) || 0,
    stD: (r.stabilityDelta as number) || 0,
    cD: (r.coalitionDelta as number) || 0,
    pScores: (r.personaScores as Record<string, number>) || {},
    sScores: (r.stakeholderScores as Record<string, number>) || {},
    econFx: (r.economyEffects as Record<string, number>) || {},
    diploFx: (r.diplomacyChanges as Record<string, number>) || {},
    cs: (r.civilService as AnalysisResult['cs']) || { summary: '', risk: 'Medium', treasuryCost: 'Medium', growthPotential: 'Medium', complexity: 'Medium', publicSensitivity: 'Medium', recommendation: '' },
    press: (r.press as AnalysisResult['press']) || { left: { headline: '-', subhead: '' }, center: { headline: '-', subhead: '' }, right: { headline: '-', subhead: '' } },
    cb: (r.checksAndBalances as AnalysisResult['cb']) || { parliament: 70, court: 80, president: 50, implementationRate: 80 },
    consequence: (r.consequence as AnalysisResult['consequence']) || null,
    flags: (r.flags as Record<string, boolean>) || {},
    socialFx: (r.socialEffects as Record<string, number>) || { press: 0, corrupt: 0 },
  };
}

export async function analyze(ev: ActiveEvent | null, policy: string): Promise<AnalysisResult> {
  const G = getState();

  if (getAIProvider() !== 'none') {
    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.classList.add('active');
    try {
      const evStr = ev ? `Event: ${ev.headline}\n${ev.description}\nContext: ${ev.context}` : 'No event';
      const raw = await callAI(getSystemPrompt(), `${evStr}\n\nPolicy: ${policy}`);
      if (raw) {
        const result = parseAIResult(raw);
        G.analysis = result;
        const aiInd = document.getElementById('aiIndicator2');
        if (aiInd) { aiInd.textContent = 'AI'; aiInd.classList.add('active'); }
        return result;
      }
    } catch (e) {
      console.error('AI analysis failed, falling back to keywords:', e);
    } finally {
      const loading = document.getElementById('loadingOverlay');
      if (loading) loading.classList.remove('active');
    }
  }

  // Show offline mode indicator
  const aiInd = document.getElementById('aiIndicator2');
  if (aiInd) { aiInd.textContent = '⚡ Lokálna analýza'; aiInd.classList.add('active'); }

  const result = kwScore(policy);
  G.analysis = result;
  return result;
}
