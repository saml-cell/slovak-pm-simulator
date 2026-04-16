import type { ActiveEvent, AnalysisResult, RawAIResult } from './types';
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
${G.cabinet.ministers.length ? `Cabinet(cohesion:${Math.round(G.cabinet.cabinetCohesion)}%): ${G.cabinet.ministers.map(m => `${m.name}(${m.ministry},comp:${m.competence},loy:${m.loyalty})`).join(',')}. Minister competence affects policy implementation in their domain.` : ''}
${G.court.judges.length ? `Constitutional Court: ${G.court.judges.length}/13 judges, prestige:${Math.round(G.court.courtPrestige)}, vacancies:${G.court.pendingVacancies}. Court ideology affects checks&balances.court score.` : ''}
${G.institutions.heads.length ? `Institutions(integrity:${Math.round(G.institutions.institutionalIntegrity)},captured:${G.institutions.capturedCount}): ${G.institutions.heads.map(h => `${h.name}(${h.institution},loy:${h.loyalty})`).join(',')}.` : ''}
All text Slovak with proper diacritics. Be realistic and harsh.`;
}

function parseAIResult(raw: RawAIResult): AnalysisResult {
  return {
    aD: raw.approvalDelta || 0,
    stD: raw.stabilityDelta || 0,
    cD: raw.coalitionDelta || 0,
    pScores: raw.personaScores || {},
    sScores: raw.stakeholderScores || {},
    econFx: raw.economyEffects || {},
    diploFx: raw.diplomacyChanges || {},
    cs: raw.civilService || { summary: '', risk: 'Medium', treasuryCost: 'Medium', growthPotential: 'Medium', complexity: 'Medium', publicSensitivity: 'Medium', recommendation: '' },
    press: raw.press || { left: { headline: '-', subhead: '' }, center: { headline: '-', subhead: '' }, right: { headline: '-', subhead: '' } },
    cb: raw.checksAndBalances || { parliament: 70, court: 80, president: 50, implementationRate: 80 },
    consequence: raw.consequence || null,
    flags: raw.flags || {},
    socialFx: raw.socialEffects || { press: 0, corrupt: 0 },
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

  const aiInd = document.getElementById('aiIndicator2');
  if (aiInd) { aiInd.textContent = '⚡ Lokálna analýza'; aiInd.classList.add('active'); }

  const result = kwScore(policy);
  G.analysis = result;
  return result;
}
