import type { PuterChatMessage, PuterChatResponse, RawAIResult } from './types';

function parseJSONFromAI(text: string): RawAIResult {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  return JSON.parse((m ? m[1] : text).trim()) as RawAIResult;
}

let puterLoaded = false;

declare const puter: {
  ai: {
    chat: (messages: PuterChatMessage[], opts?: { model: string }) => Promise<PuterChatResponse | string>;
  };
};

export function getAIProvider(): string {
  return sessionStorage.getItem('ai_provider') || 'none';
}

async function loadPuter(): Promise<void> {
  if (puterLoaded) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.puter.com/v2/';
    s.onload = () => { puterLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function callAI(sys: string, msg: string): Promise<RawAIResult | null> {
  const provider = getAIProvider();
  const k = sessionStorage.getItem('ai_api_key');

  if (provider === 'puter') {
    try {
      if (!puterLoaded) await loadPuter();
      const timeoutP = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000));
      const aiP = puter.ai.chat([{ role: 'system', content: sys }, { role: 'user', content: msg }], { model: 'gpt-4o-mini' });
      const resp = await Promise.race([aiP, timeoutP]);
      if (typeof resp === 'string') return parseJSONFromAI(resp);
      const respMsg = resp.message;
      const content = respMsg?.content;
      let t: string;
      if (Array.isArray(content)) {
        t = content[0]?.text || JSON.stringify(resp);
      } else if (typeof content === 'string') {
        t = content;
      } else {
        t = resp.text || JSON.stringify(resp);
      }
      return parseJSONFromAI(t);
    } catch (e) { console.error('Puter AI:', e); return null; }
  }

  if (provider === 'groq' && k) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 4000, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) return null;
      const d: { choices: Array<{ message: { content: string } }> } = await r.json();
      const t = d.choices[0].message.content;
      return parseJSONFromAI(t);
    } catch (e) { console.error('Groq:', e); return null; }
  }

  if (provider === 'anthropic' && k) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 4000, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) return null;
      const d: { content: Array<{ text: string }> } = await r.json();
      const t = d.content[0].text;
      return parseJSONFromAI(t);
    } catch (e) { console.error('Anthropic:', e); return null; }
  }

  return null;
}
