/**
 * FRED (Federal Reserve Bank of St. Louis) — the backbone economic series provider.
 *
 * Why FRED first: it is the cheapest way to get *authoritative, citable, machine
 * readable* US macro data. The public `fredgraph.csv` endpoint needs no API key,
 * no registration and no attribution beyond the URL itself, and it carries the
 * observation date we need for provenance. That combination is rare: most
 * "free" financial APIs are either keyed, rate-crippled, or undocumented.
 *
 * A known quirk we handle explicitly: FRED returns a ZIP archive when more than
 * one series id is requested in a single call. We therefore fetch one series per
 * request and let the HTTP cache do the deduplication.
 */
import type { HttpClient } from '../http.ts';
import { point, type DataPoint } from '../provenance.ts';

const BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

export const FRED_LICENSE = 'Public domain — US Government work (Federal Reserve Board / BLS / BEA via FRED)';

export interface FredObservation {
  date: string;
  value: number | null;
}

export interface FredSeriesOptions {
  /** Inclusive start date, `YYYY-MM-DD`. Defaults to provider maximum history. */
  start?: string;
  /** End date, `YYYY-MM-DD`. */
  end?: string;
  /** Freshness window. Macro series update daily at most, so 6h is generous. */
  ttlSeconds?: number;
}

/**
 * Parse `fredgraph.csv`. Two header shapes exist in the wild
 * (`DATE,VALUE` on legacy series, `observation_date,VALUE` on modern ones), and
 * missing observations arrive as `.`. Both are handled.
 */
export function parseFredCsv(csv: string): FredObservation[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = (lines[0] ?? '').split(',');
  if (header.length < 2) return [];
  const out: FredObservation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const comma = raw.indexOf(',');
    if (comma === -1) continue;
    const date = raw.slice(0, comma).trim();
    const literal = raw.slice(comma + 1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const value = literal === '.' || literal === '' ? null : Number(literal);
    out.push({ date, value: Number.isFinite(value as number) ? (value as number) : null });
  }
  return out;
}

export class FredSource {
  readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async series(
    seriesId: string,
    options: FredSeriesOptions = {},
  ): Promise<DataPoint<FredObservation[]>> {
    const params = new URLSearchParams({ id: seriesId });
    if (options.start) params.set('cosd', options.start);
    if (options.end) params.set('coed', options.end);
    const url = `${BASE}?${params.toString()}`;

    const res = await this.http.getText(url, {
      ttlMs: (options.ttlSeconds ?? 6 * 3600) * 1000,
      staleIfErrorMs: 14 * 24 * 3600 * 1000,
      timeoutMs: 15_000,
    });

    const observations = parseFredCsv(res.text);
    if (observations.length === 0) {
      throw new Error(`FRED series ${seriesId} returned no parseable observations`);
    }
    const lastObservation = observations[observations.length - 1];

    return point(observations, {
      source: `fred:${seriesId}`,
      sourceKind: 'live',
      sourceUrl: url,
      retrievedAt: res.retrievedAt,
      asOf: lastObservation?.date ?? null,
      license: FRED_LICENSE,
      method: `Official FRED series ${seriesId}, parsed from the provider CSV (missing observations dropped).`,
      staleAfterSeconds: options.ttlSeconds ?? 6 * 3600,
    });
  }

  /** Most recent non-null observation. Useful for "current" rates and index levels. */
  async latest(seriesId: string, options: FredSeriesOptions = {}) {
    const series = await this.series(seriesId, { ...options, start: options.start ?? '2020-01-01' });
    for (let i = series.value.length - 1; i >= 0; i--) {
      const obs = series.value[i];
      if (obs && obs.value !== null) {
        return point(obs, { ...series.provenance, asOf: obs.date, method: `${series.provenance.method} Latest non-null observation used.` });
      }
    }
    throw new Error(`FRED series ${seriesId} has no non-null observation`);
  }

  /**
   * Convert an index series (CPI, etc.) into year-over-year percent change.
   * This is a derived point, and it says so, so a client never mistakes it for a
   * provider-published statistic.
   */
  async yearOverYear(seriesId: string, options: FredSeriesOptions = {}) {
    const series = await this.series(seriesId, { ...options, start: options.start ?? '2023-01-01' });
    const rows = series.value.filter((o): o is { date: string; value: number } => o.value !== null);
    const byDate = new Map(rows.map((r) => [r.date, r.value]));
    const out: Array<{ date: string; yoyPct: number }> = [];
    for (const row of rows) {
      const [y, m, d] = row.date.split('-');
      const prior = byDate.get(`${Number(y) - 1}-${m}-${d}`);
      if (prior && prior !== 0) out.push({ date: row.date, yoyPct: ((row.value / prior - 1) * 100) });
    }
    const latestValue = out[out.length - 1];
    return point(out, {
      ...series.provenance,
      source: `fred:${seriesId}:yoy`,
      sourceKind: 'derived',
      asOf: latestValue?.date ?? series.provenance.asOf,
      method: `Year-over-year percent change of FRED series ${seriesId} (same calendar month, prior year).`,
      derivedFrom: [`fred:${seriesId}`],
      staleAfterSeconds: 12 * 3600,
    });
  }
}

/** Series ids this codebase actually uses, with a one-line rationale each. */
export const FRED_SERIES = {
  DGS10: '10-year Treasury constant-maturity yield — discount rate anchor',
  DGS2: '2-year Treasury yield — curve slope / recession signal',
  DGS30: '30-year Treasury yield — long-duration annuity pricing anchor',
  T10YIE: '10-year breakeven inflation — market-implied inflation expectation',
  CPIAUCSL: 'CPI-U, all items, seasonally adjusted — inflation assumption',
  CPIUFDNS: 'CPI-U, all items, not seasonally adjusted (used for Social Security COLA)',
  NASDAQCOM: 'Nasdaq Composite index — long-history equity series for Monte Carlo calibration (1971-)',
  SP500: 'S&P 500 index — 10-year window, used as a cross-check on the calibration series',
  DEXUSEU: 'USD/EUR exchange rate',
  MORTGAGE30US: '30-year fixed mortgage rate — household context',
  VIXCLS: 'CBOE volatility index — risk regime context',
  UNRATE: 'Unemployment rate — macro context',
  MEHOINUSA672N: 'Real median household income — affordability context',
} as const;

export type FredSeriesId = keyof typeof FRED_SERIES;
