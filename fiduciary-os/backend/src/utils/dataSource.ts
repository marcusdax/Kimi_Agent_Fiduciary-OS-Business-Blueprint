import { AppError } from '../middleware/errorHandler';

/**
 * Where a piece of data came from. Every market, crypto and AI response carries one,
 * so a client (and a supervisor reading logs) can always tell real data from placeholders.
 *
 * - live:         fetched from the named provider just now
 * - mock:         static placeholder values for development; never real prices
 * - fallback:     canned, non-personalised text used when no AI provider is reachable
 * - illustrative: computed estimates that do not come from any provider (e.g. insurance)
 */
export type DataSource = 'live' | 'mock' | 'fallback' | 'illustrative';

/** Placeholder data is a development convenience. In production we fail closed. */
export function placeholdersAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Call before returning mock or fallback data. Throws 503 in production so placeholder
 * values can never reach a real user dressed up as live data.
 */
export function assertPlaceholdersAllowed(what: string): void {
  if (!placeholdersAllowed()) {
    throw new AppError(503, `${what} is temporarily unavailable: no live data source is configured`);
  }
}

/** Collapse several sources into one: any non-live input makes the whole result non-live. */
export function combineSources(sources: DataSource[]): DataSource {
  if (sources.length === 0) return 'live';
  if (sources.includes('mock')) return 'mock';
  if (sources.includes('fallback')) return 'fallback';
  if (sources.includes('illustrative')) return 'illustrative';
  return 'live';
}
