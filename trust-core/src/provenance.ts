/**
 * provenance.ts — the one rule that makes a financial product trustworthy:
 * **every number carries its receipt.**
 *
 * Why a first-class type instead of a `source` string
 * ---------------------------------------------------
 * The upstream Fiduciary OS prototype attached `source: 'live' | 'mock'` to
 * responses. That is necessary but not sufficient: a supervisor reading a client
 * file needs to know *which* provider, *which* observation date, *how* the number
 * was obtained, and whether it is still fresh. Those are properties of an
 * individual number, not of an HTTP response — a retirement projection mixes a
 * Treasury yield, a CPI series, a mortality table and a user's own input, each
 * with a different vintage.
 *
 * So provenance travels with the value: `DataPoint<T>`.
 */

/** How the value came to exist. Drives what we are allowed to claim about it. */
export type SourceKind =
  /** Retrieved from the named provider during this request (or a warm cache of it). */
  | 'live'
  /** An official statistical table shipped with the build, versioned and cited. */
  | 'bundled-official'
  /** Computed by us from other DataPoints (the inputs are listed in `derivedFrom`). */
  | 'derived'
  /** The user's own input. Not a data source; must be labelled as self-reported. */
  | 'user-input'
  /** Deterministic placeholder. Never allowed to reach a production response. */
  | 'mock';

export interface Provenance {
  /** Stable provider key, e.g. `fred:DGS10`, `treasury:fiscaldata:avg_interest_rates`. */
  source: string;
  sourceKind: SourceKind;
  /** Human-clickable citation. Required for live and bundled-official sources. */
  sourceUrl: string;
  /** When our process obtained it (ISO-8601, UTC). */
  retrievedAt: string;
  /** The observation or publication date of the value itself (ISO-8601 date), if it has one. */
  asOf: string | null;
  /** Redistribution terms. We surface this because some of our best sources forbid commercial reuse. */
  license: string;
  /** One sentence a non-engineer can understand: how this number was produced. */
  method: string;
  /** Seconds after `retrievedAt` at which the value should be considered stale. */
  staleAfterSeconds?: number;
  /** For `derived` points: the sources that fed the computation. */
  derivedFrom?: string[];
}

export interface DataPoint<T> {
  value: T;
  provenance: Provenance;
}

export type Series = DataPoint<Array<{ date: string; value: number | null }>>;

export const point = <T>(value: T, provenance: Provenance): DataPoint<T> => ({ value, provenance });

/** Attach a computed value to the receipts that justify it. */
export function derive<T>(
  value: T,
  inputs: Array<DataPoint<unknown> | Provenance>,
  method: string,
  source = 'fiduciary-os:derived',
): DataPoint<T> {
  const provenances = inputs.map((i) => ('provenance' in i ? i.provenance : i));
  const oldestRetrieval = provenances
    .map((p) => p.retrievedAt)
    .sort()
    .shift();
  return point(value, {
    source,
    sourceKind: 'derived',
    sourceUrl: provenances[0]?.sourceUrl ?? '',
    retrievedAt: oldestRetrieval ?? new Date().toISOString(),
    asOf: provenances
      .map((p) => p.asOf)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null,
    license: 'Derived work — see derivedFrom',
    method,
    derivedFrom: provenances.map((p) => p.source),
    staleAfterSeconds: Math.min(...provenances.map((p) => p.staleAfterSeconds ?? 3600)),
  });
}

/** Provenance for a number the user typed in. We never launder these as data. */
export function userInput(label: string): Provenance {
  return {
    source: `user:${label}`,
    sourceKind: 'user-input',
    sourceUrl: '',
    retrievedAt: new Date().toISOString(),
    asOf: null,
    license: 'n/a',
    method: `Self-reported by the user: ${label}`,
  };
}

export function isStale(p: Provenance, now: number = Date.now()): boolean {
  if (!p.staleAfterSeconds) return false;
  return now - Date.parse(p.retrievedAt) > p.staleAfterSeconds * 1000;
}

export class PlaceholderInProductionError extends Error {
  override readonly name: string = 'PlaceholderInProductionError';
  readonly subject: string;
  constructor(subject: string) {
    super(
      `Refusing to serve placeholder data for "${subject}" in production. ` +
        'A live provider or an official bundled table must back this value.',
    );
    this.subject = subject;
  }
}

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/**
 * The production gate. Mirrors the upstream `assertPlaceholdersAllowed` contract
 * so behaviour does not change for existing clients, but is enforceable on a
 * per-DataPoint basis rather than per-response.
 */
export function assertServed(d: DataPoint<unknown>, subject: string): void {
  if (isProduction() && d.provenance.sourceKind === 'mock') {
    throw new PlaceholderInProductionError(subject);
  }
}

/** Collapse a bag of DataPoints into the weakest source kind present. */
export function weakestKind(points: Array<DataPoint<unknown>>): SourceKind {
  const order: SourceKind[] = ['mock', 'derived', 'user-input', 'bundled-official', 'live'];
  let worst = 0;
  for (const p of points) {
    const idx = order.indexOf(p.provenance.sourceKind);
    if (idx !== -1 && idx < worst) worst = idx;
  }
  return order[worst] ?? 'live';
}
