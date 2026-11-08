/**
 * US Treasury — primary source for the sovereign curve and fiscal aggregates.
 *
 * Two distinct endpoints, deliberately kept apart:
 *
 *  - `api.fiscaldata.treasury.gov` (JSON): fast, stable, no key. Used for average
 *    interest rates on the debt and for fiscal context panels.
 *  - `home.treasury.gov/.../daily-treasury-rates.csv` (CSV): the official par
 *    yield curve, i.e. the *only* source we should price annuities off. It is
 *    generated on demand and can take 10-20s cold, so it is cached for a day and
 *    is never on a request's critical path without a fallback.
 *
 * Production note: the yield curve has a FRED fallback because a 20-second
 * generation should never be allowed to fail a client-facing projection.
 */
import type { HttpClient } from '../http.ts';
import { point, derive, type DataPoint } from '../provenance.ts';
import type { FredSource } from './fred.ts';

const FISCAL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service';
const CURVE_BASE = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv';

export const TREASURY_LICENSE = 'Public domain — US Government work (US Department of the Treasury)';

export interface FiscalPage<T> {
  data: T[];
  meta: { count: number; total_count: number; total_pages: number; labels?: Record<string, string> };
  links?: Record<string, string | null>;
}

/** Maturities as printed by Treasury, in the order they appear in the CSV header. */
export const CURVE_TENORS = [
  '1 Mo', '1.5 Month', '2 Mo', '3 Mo', '4 Mo', '6 Mo', '1 Yr', '2 Yr', '3 Yr',
  '5 Yr', '7 Yr', '10 Yr', '20 Yr', '30 Yr',
] as const;

export type CurveTenor = (typeof CURVE_TENORS)[number];

export interface YieldCurveRow {
  date: string;
  /** Percent, not decimal. A `4.21` here means 4.21%. */
  yields: Partial<Record<CurveTenor, number>>;
}

/**
 * Parse the Treasury daily par-yield CSV. Header is
 * `Date,"1 Mo","1.5 Month",...,"30 Yr"` and dates are `MM/DD/YYYY`.
 */
export function parseTreasuryCurveCsv(csv: string): YieldCurveRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0] ?? '');
  const dateIdx = header.findIndex((h) => h.toLowerCase() === 'date');
  if (dateIdx === -1) return [];

  const out: YieldCurveRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    const cells = splitCsvLine(raw);
    const rawDate = cells[dateIdx]?.trim();
    if (!rawDate) continue;
    const iso = toIsoDate(rawDate);
    if (!iso) continue;
    const yields: Partial<Record<CurveTenor, number>> = {};
    for (const tenor of CURVE_TENORS) {
      const idx = header.indexOf(tenor);
      if (idx === -1) continue;
      const cell = cells[idx]?.trim();
      if (!cell || cell === 'N/A') continue;
      const n = Number(cell);
      if (Number.isFinite(n)) yields[tenor] = n;
    }
    out.push({ date: iso, yields });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

function toIsoDate(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (m) return `${m[3]}-${(m[1] ?? '').padStart(2, '0')}-${(m[2] ?? '').padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

export class TreasurySource {
  readonly http: HttpClient;
  readonly fred: FredSource | undefined;

  constructor(http: HttpClient, fred?: FredSource) {
    this.http = http;
    this.fred = fred;
  }

  /** Average interest rate on the federal debt, newest first. */
  async averageInterestRates(limit = 12) {
    const url = `${FISCAL}/v2/accounting/od/avg_interest_rates?page%5Bsize%5D=${limit}&sort=-record_date`;
    const res = await this.http.getJson<FiscalPage<Record<string, string>>>(url, {
      ttlMs: 12 * 3600 * 1000,
      staleIfErrorMs: 30 * 24 * 3600 * 1000,
    });
    return point(res.json.data, {
      source: 'treasury:fiscaldata:avg_interest_rates',
      sourceKind: 'live',
      sourceUrl: url,
      retrievedAt: res.retrievedAt,
      asOf: res.json.data[0]?.record_date ?? null,
      license: TREASURY_LICENSE,
      method: 'Treasury Fiscal Data API v2, average interest rates on US interest-bearing debt, newest first.',
      staleAfterSeconds: 12 * 3600,
    });
  }

  /**
   * Official daily par yield curve for a calendar year.
   * Cold generation is slow, so: 24h cache, 40s ceiling, 30-day stale tolerance.
   */
  async yieldCurve(year: number): Promise<DataPoint<YieldCurveRow[]>> {
    const url = `${CURVE_BASE}/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
    try {
      const res = await this.http.getText(url, {
        ttlMs: 24 * 3600 * 1000,
        staleIfErrorMs: 45 * 24 * 3600 * 1000,
        timeoutMs: 40_000,
      });
      const rows = parseTreasuryCurveCsv(res.text);
      if (rows.length === 0) throw new Error('empty treasury curve');
      return point(rows, {
        source: `treasury:par_yield_curve:${year}`,
        sourceKind: 'live',
        sourceUrl: url,
        retrievedAt: res.retrievedAt,
        asOf: rows[rows.length - 1]?.date ?? null,
        license: TREASURY_LICENSE,
        method: 'US Treasury daily par yield curve CSV, parsed to percent yields by tenor.',
        staleAfterSeconds: 24 * 3600,
      });
    } catch (err) {
      if (!this.fred) throw err;
      return this.#curveFromFred(year);
    }
  }

  async #curveFromFred(year: number): Promise<DataPoint<YieldCurveRow[]>> {
    const map: Array<[CurveTenor, string]> = [
      ['1 Yr', 'DGS1'], ['2 Yr', 'DGS2'], ['3 Yr', 'DGS3'], ['5 Yr', 'DGS5'],
      ['7 Yr', 'DGS7'], ['10 Yr', 'DGS10'], ['20 Yr', 'DGS20'], ['30 Yr', 'DGS30'],
    ];
    const series = await Promise.all(
      map.map(async ([tenor, id]) => ({ tenor, dp: await this.fred!.series(id, { start: `${year}-01-01` }) })),
    );
    const byDate = new Map<string, YieldCurveRow>();
    for (const { tenor, dp } of series) {
      for (const obs of dp.value) {
        if (obs.value === null) continue;
        const row = byDate.get(obs.date) ?? { date: obs.date, yields: {} };
        row.yields[tenor] = obs.value;
        byDate.set(obs.date, row);
      }
    }
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) throw new Error('no treasury curve data from either source');
    return derive(rows, series.map((s) => s.dp), 'Derived from FRED Treasury constant-maturity series (Treasury CSV unavailable).');
  }

  /** Convenience: the most recent full curve, plus the derived 10y-2y spread. */
  async latestCurve() {
    const curve = await this.yieldCurve(new Date().getUTCFullYear());
    const last = curve.value[curve.value.length - 1];
    if (!last) throw new Error('empty yield curve');
    const ten = last.yields['10 Yr'];
    const two = last.yields['2 Yr'];
    return {
      curve,
      latest: last,
      spread10y2y: ten !== undefined && two !== undefined ? point(ten - two, {
        source: 'fiduciary-os:treasury-spread',
        sourceKind: 'derived' as const,
        sourceUrl: curve.provenance.sourceUrl,
        retrievedAt: curve.provenance.retrievedAt,
        asOf: last.date,
        license: TREASURY_LICENSE,
        method: '10-year par yield minus 2-year par yield, same observation date. Negative means inverted.',
        derivedFrom: [curve.provenance.source],
        staleAfterSeconds: 24 * 3600,
      }) : null,
    };
  }
}
