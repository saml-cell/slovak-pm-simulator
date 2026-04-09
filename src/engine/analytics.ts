// Simple localStorage-based analytics for tracking player activity

interface AnalyticsEvent {
  event: string;
  era?: string;
  month?: number;
  data?: Record<string, unknown>;
  timestamp: string;
}

const ANALYTICS_KEY = 'spm_analytics';

export function trackAnalytics(event: string, data?: Record<string, unknown>): void {
  try {
    const events: AnalyticsEvent[] = JSON.parse(localStorage.getItem(ANALYTICS_KEY) || '[]');
    events.push({
      event,
      era: data?.era as string | undefined,
      month: data?.month as number | undefined,
      data,
      timestamp: new Date().toISOString()
    });
    // Keep max 500 events to prevent localStorage bloat
    if (events.length > 500) events.splice(0, events.length - 500);
    localStorage.setItem(ANALYTICS_KEY, JSON.stringify(events));
  } catch { /* localStorage full or unavailable */ }
}
