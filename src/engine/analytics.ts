import type { AnalyticsData } from './types';

interface AnalyticsEvent {
  event: string;
  era?: string;
  month?: number;
  data?: AnalyticsData;
  timestamp: string;
}

const ANALYTICS_KEY = 'spm_analytics';

export function trackAnalytics(event: string, data?: AnalyticsData): void {
  // Local copy (debugging, player's own review via console)
  try {
    const events: AnalyticsEvent[] = JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '[]');
    events.push({
      event,
      era: data?.era,
      month: data?.month,
      data,
      timestamp: new Date().toISOString()
    });
    // Cap at 500 events so a long-lived session can't blow out localStorage.
    if (events.length > 500) events.splice(0, events.length - 500);
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(events));
  } catch { /* localStorage full or unavailable */ }
  // Plausible — if the tracker is loaded (see index.html / game.html), fire
  // a custom event. Plausible's plausible() global is added by their script
  // tag. Props stay small (era, month) to fit within Plausible's custom-event
  // limits. No fallback needed — if Plausible isn't loaded, this no-ops.
  try {
    const w = window as unknown as { plausible?: (event: string, opts?: { props?: Record<string, string | number> }) => void };
    if (typeof w.plausible === 'function') {
      const props: Record<string, string | number> = {};
      if (data?.era) props.era = data.era;
      if (typeof data?.month === 'number') props.month = data.month;
      w.plausible(event, Object.keys(props).length ? { props } : undefined);
    }
  } catch { /* ignore */ }
}
