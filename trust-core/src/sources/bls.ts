/**
 * Bureau of Labor Statistics — official CPI with vintage metadata.
 *
 * We already get CPI through FRED, so why a second source? Because FRED is a
 * *redistributor*. When a client-facing number drives a Social Security COLA
 * conversation, we want the option to cite the statistical agency directly, and
 * we want a second path when FRED is degraded. Two independent routes to the same
 * official series is the cheapest form of data resilience we can buy.
 *
 * Quirks handled: BLS returns `REQUEST_NOT_PROCESSED` with a 200 status, and it
 * silently caps a request at 20 series / 20 years. Both are treated as data
 * errors, not transport errors, so they never trigger a retry storm.
 */
import type { HttpClient } from '../http.ts';
import { point } from '../provenance.ts';

const ENDPOINT = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
export const BLS_LICENSE = 'Public domain — US Government work (Bureau of Labor Statistics)';

export interface BlsObservation {
  year: string;
  period: string;
  periodName: string;
  value: number;
  footnotes?: Array<{ code: string; text: string }>;
}

interface BlsResponse {
  status: string;
  message?: string[];
  Results?: { series: Array<{ seriesID: string; data: BlsObservation[] }> };
}

/** CPI series ids we rely on, with the exact question each answers. */
export const BLS_SERIES = {
  CUUR0000SA0: 'CPI-U, all items, US city average, not seasonally adjusted — the series Social Security COLA is based on',
  CUSR0000SA0: 'CPI-U, all items, seasonally adjusted — month-to-month inflation trend',
  CUUR0000SAH1: 'CPI-U, housing — shelter cost pressure for household budgets',
  CUUR0000SAF1: 'CPI-U, food — household expense context',
} as const;

export class BlsSource {
  readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async series(seriesIds: string[], startYear: number, endYear: number) {
    if (seriesIds.length > 20) throw new Error('BLS public API accepts at most 20 series per request');
    if (endYear - startYear > 20) throw new Error('BLS public API accepts at most 20 years per request');

    const body = JSON.stringify({ seriesid: seriesIds, startyear: String(startYear), endyear: String(endYear) });
    const res = await this.http.getJson<BlsResponse>(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      ttlMs: 12 * 3600 * 1000,
      staleIfErrorMs: 30 * 24 * 3600 * 1000,
      cacheKey: `POST ${ENDPOINT} ${body}`,
      timeoutMs: 20_000,
    });

    if (res.json.status !== 'REQUEST_SUCCEEDED') {
      throw new Error(`BLS rejected the request: ${res.json.status} ${(res.json.message ?? []).join('; ')}`);
    }
    const series = res.json.Results?.series ?? [];
    if (series.length === 0) throw new Error('BLS returned no series');

    const normalised = series.map((s) => ({
      seriesId: s.seriesID,
      observations: s.data
        .filter((o) => /^M(0[1-9]|1[0-2])$/.test(o.period))
        .map((o) => ({ year: o.year, period: o.period, periodName: o.periodName, value: Number(o.value) }))
        .sort((a, b) => `${a.year}${a.period}`.localeCompare(`${b.year}${b.period}`)),
    }));

    const latest = normalised[0]?.observations.at(-1);
    return point(normalised, {
      source: `bls:${seriesIds.join('+')}`,
      sourceKind: 'live' as const,
      sourceUrl: ENDPOINT,
      retrievedAt: res.retrievedAt,
      asOf: latest ? `${latest.year}-${latest.period.slice(1)}-01` : null,
      license: BLS_LICENSE,
      method: `BLS Public Data API v2, monthly observations ${startYear}-${endYear}, M01-M12 only (annual averages excluded).`,
      staleAfterSeconds: 12 * 3600,
    });
  }

  /** Latest month-over-month and year-over-year inflation from the headline CPI series. */
  async inflationSnapshot(now = new Date()) {
    const year = now.getUTCFullYear();
    const series = await this.series(['CUUR0000SA0'], year - 1, year);
    const obs = series.value[0]?.observations ?? [];
    const last = obs.at(-1);
    const prior = obs.at(-2);
    const lastYear = obs.find((o) => last && o.year === String(Number(last.year) - 1) && o.period === last.period);

    return point(
      {
        latest: last ?? null,
        monthOverMonthPct: last && prior ? ((last.value / prior.value - 1) * 100) : null,
        yearOverYearPct: last && lastYear ? ((last.value / lastYear.value - 1) * 100) : null,
      },
      {
        ...series.provenance,
        source: 'bls:CUUR0000SA0:summary',
        sourceKind: 'derived' as const,
        method: 'Latest CPI-U month, with MoM and YoY change computed from the same unchanged series.',
        derivedFrom: ['bls:CUUR0000SA0'],
      },
    );
  }
}
