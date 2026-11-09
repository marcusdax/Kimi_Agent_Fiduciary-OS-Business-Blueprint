/**
 * Funnel analytics: consent-gated, no PII. Events are buffered locally; an optional PostHog
 * sink is used only when the visitor has opted in AND VITE_POSTHOG_KEY is set.
 * Event properties are restricted to an allowlist so free text, amounts and identifiers
 * can never be attached by accident.
 */
export const FUNNEL_EVENTS = ['visit', 'calculator_used', 'preview_completed', 'register_clicked', 'registered'] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

const ALLOWED_PROPS = new Set(['calculator', 'step']);
const CONSENT_KEY = 'fos.analytics.consent';
const BUFFER_KEY = 'fos.analytics.buffer';
const MAX_BUFFER = 200;

type Props = Record<string, string>;
export interface BufferedEvent { event: FunnelEvent; props: Props; at: string }

function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function hasConsent(): boolean {
  return store()?.getItem(CONSENT_KEY) === 'granted';
}

export function setConsent(granted: boolean): void {
  const s = store();
  if (!s) return;
  s.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
  if (!granted) s.removeItem(BUFFER_KEY);
}

export function sanitize(props: Record<string, unknown> = {}): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (ALLOWED_PROPS.has(k) && typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v)) out[k] = v;
  }
  return out;
}

export function getBuffer(): BufferedEvent[] {
  try { return JSON.parse(store()?.getItem(BUFFER_KEY) ?? '[]') as BufferedEvent[]; } catch { return []; }
}

export function track(
  event: FunnelEvent,
  props?: Record<string, unknown>,
  sink: (e: BufferedEvent) => void = postHogSink
): boolean {
  if (!hasConsent() || !FUNNEL_EVENTS.includes(event)) return false;
  const entry: BufferedEvent = { event, props: sanitize(props), at: new Date().toISOString() };
  const s = store();
  if (s) {
    const next = [...getBuffer(), entry].slice(-MAX_BUFFER);
    try { s.setItem(BUFFER_KEY, JSON.stringify(next)); } catch { /* storage full: drop silently */ }
  }
  try { sink(entry); } catch { /* analytics must never break the app */ }
  return true;
}

function postHogSink(e: BufferedEvent): void {
  const key = import.meta.env?.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  const host = ((import.meta.env?.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com').replace(/\/$/, '');
  // Anonymous, non-identifying: a random per-browser id is not stored; each event is its own person.
  void fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, event: e.event, distinct_id: crypto.randomUUID(), properties: { ...e.props, $process_person_profile: false }, timestamp: e.at }),
    keepalive: true,
  }).catch(() => undefined);
}
