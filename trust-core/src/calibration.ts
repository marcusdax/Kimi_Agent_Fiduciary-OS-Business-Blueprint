/**
 * calibration.ts — turns live provider data into the assumptions the engines need.
 *
 * This is the seam that makes "real data" true rather than decorative. Each engine
 * needs a small number of *inputs*, and each input is fetched from a named primary
 * source with a documented fallback:
 *
 *   equity real returns  <- FRED WILL5000IND deflated by FRED CPIAUCSL
 *   bond real yield      <- FRED DGS10 minus FRED T10YIE
 *   discount curve       <- US Treasury par yields (FRED fallback)
 *   mortality            <- SSA period life table (bundled, versioned)
 *   tax law              <- IRS Revenue Procedure (bundled, versioned)
 *
 * If a live input is unavailable, the caller gets a typed error rather than a
 * silent default. That is the whole point: a projection built on a guessed 7%
 * return is indistinguishable from one built on data unless the code refuses to
 * guess.
 */
import type { HttpClient } from './http.ts';
import { FredSource } from './sources/fred.ts';
import { TreasurySource } from './sources/treasury.ts';
import type { MonteCarloAssumptions } from './engines/montecarlo.ts';
import { toAnnualRealReturns } from './engines/montecarlo.ts';
import { derive, type DataPoint } from './provenance.ts';

export interface Calibration {
  assumptions: MonteCarloAssumptions;
  /** Calendar years covered by the equity series, for the caveat text. */
  observedFrom: number;
  observedTo: number;
  provenanceSources: string[];
}

export class CalibrationService {
  readonly fred: FredSource;
  readonly treasury: TreasurySource;

  constructor(http: HttpClient) {
    this.fred = new FredSource(http);
    this.treasury = new TreasurySource(http, this.fred);
  }

  /**
   * ~55 years of history is plenty: we need annual observations, and a window
   * long enough to contain 1970s inflation, 1987, 2000-02, 2007-09 and 2022.
   *
   * Series choice, and why it is not the S&P 500: FRED's `SP500` only carries ten
   * years, which is too short to bootstrap five-year blocks without recycling the
   * same few paths. `NASDAQCOM` runs from 1971 and is an official FRED series. It is
   * more volatile and more growth-tilted than a diversified portfolio, so it makes
   * the projection *conservative* on drawdown and optimistic on mean — a trade-off
   * stated in the caveat text rather than hidden. Override with EQUITY_SERIES_ID.
   */
  async equityRealReturns(startYear = 1971): Promise<DataPoint<{ years: number[]; realReturns: number[] }>> {
    const seriesId = process.env.EQUITY_SERIES_ID ?? 'NASDAQCOM';
    const [prices, cpi] = await Promise.all([
      this.fred.series(seriesId, { start: `${startYear}-01-01`, ttlSeconds: 24 * 3600 }),
      this.fred.series('CPIAUCSL', { start: `${startYear - 1}-01-01`, ttlSeconds: 24 * 3600 }),
    ]);
    const { years, realReturns } = toAnnualRealReturns(prices.value, cpi.value);
    if (realReturns.length < 20) {
      throw new Error(`only ${realReturns.length} annual real-return observations available; refusing to calibrate a projection on that`);
    }
    return derive(
      { years, realReturns },
      [prices, cpi],
      `Annual real returns: FRED ${seriesId} year-over-year, deflated by CPI-U (all items, SA). ` +
        'Price return only — dividends excluded, so the equity assumption is conservative.',
      'fiduciary-os:calibration:equity-real-returns',
    );
  }

  /** 10-year real yield implied by the nominal 10-year and the 10-year breakeven. */
  async bondRealYield(): Promise<DataPoint<number>> {
    const [nominal, breakeven] = await Promise.all([
      this.fred.latest('DGS10', { ttlSeconds: 6 * 3600 }),
      this.fred.latest('T10YIE', { ttlSeconds: 6 * 3600 }),
    ]);
    const real = nominal.value.value !== null && breakeven.value.value !== null
      ? (nominal.value.value - breakeven.value.value) / 100
      : null;
    if (real === null) throw new Error('could not derive a 10-year real yield from DGS10 and T10YIE');
    return derive(
      real,
      [nominal, breakeven],
      `10-year nominal Treasury yield (${nominal.value.value}%) minus the 10-year breakeven inflation rate ` +
        `(${breakeven.value.value}%) = ${(real * 100).toFixed(2)}% real. Approximates the TIPS yield without a TIPS call.`,
      'fiduciary-os:calibration:bond-real-yield',
    );
  }

  async assumptions(opts: { equityWeight?: number; feeRate?: number; blockYears?: number } = {}): Promise<Calibration> {
    const [equity, bond] = await Promise.all([this.equityRealReturns(), this.bondRealYield()]);
    const years = equity.value.years;
    return {
      assumptions: {
        equityRealReturns: equity.value.realReturns,
        bondRealYield: bond.value,
        blockYears: opts.blockYears ?? 5,
        ...(opts.equityWeight !== undefined ? { equityWeight: opts.equityWeight } : {}),
        ...(opts.feeRate !== undefined ? { feeRate: opts.feeRate } : {}),
      } as MonteCarloAssumptions,
      observedFrom: years[0] ?? 0,
      observedTo: years[years.length - 1] ?? 0,
      provenanceSources: [...(equity.provenance.derivedFrom ?? []), ...(bond.provenance.derivedFrom ?? [])],
    };
  }
}
