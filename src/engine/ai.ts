let puterLoaded = false;

declare const puter: { ai: { chat: (messages: unknown[], opts?: unknown) => Promise<unknown> } };

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

export async function callAI(sys: string, msg: string): Promise<Record<string, unknown> | null> {
  const provider = getAIProvider();
  const k = sessionStorage.getItem('ai_api_key');

  if (provider === 'puter') {
    try {
      if (!puterLoaded) await loadPuter();
      const timeoutP = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000));
      const aiP = puter.ai.chat([{ role: 'system', content: sys }, { role: 'user', content: msg }], { model: 'gpt-4o-mini' });
      const resp = await Promise.race([aiP, timeoutP]) as unknown;
      const r = resp as Record<string, unknown>;
      const respMsg = r?.message as Record<string, unknown> | undefined;
      const contentArr = respMsg?.content as Array<Record<string, string>> | undefined;
      const t = typeof resp === 'string' ? resp : (contentArr?.[0]?.text || respMsg?.content || r?.text || JSON.stringify(resp)) as string;
      const m = (t as string).match(/```json\s*([\s\S]*?)\s*```/) || (t as string).match(/```\s*([\s\S]*?)\s*```/) || { 1: t };
      return JSON.parse(((m as RegExpMatchArray)[1] || (t as string)).trim());
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
      const d = await r.json();
      const t = d.choices[0].message.content;
      const m = t.match(/```json\s*([\s\S]*?)\s*```/) || t.match(/```\s*([\s\S]*?)\s*```/) || { 1: t };
      return JSON.parse((m[1] || t).trim());
    } catch (e) { console.error('Groq:', e); return null; }
  }

  if (provider === 'anthropic' && k) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      const t = d.content[0].text;
      const m = t.match(/```json\s*([\s\S]*?)\s*```/) || t.match(/```\s*([\s\S]*?)\s*```/) || { 1: t };
      return JSON.parse((m[1] || t).trim());
    } catch (e) { console.error('Anthropic:', e); return null; }
  }

  return null;
}
