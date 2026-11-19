/**
 * Market quotes — deliberately a *layered* provider, because no free equity quote
 * source is contractually reliable, and a financial product must never invent a
 * price.
 *
 * Tiering (first healthy wins):
 *   1. Nasdaq public quote API  — official exchange metadata, JSON, no key.
 *   2. Yahoo chart API          — widest symbol coverage (ETFs, indices, mutual
 *                                 funds). Undocumented; used with a short TTL and
 *                                 an explicit `undocumented` flag in provenance.
 *   3. CoinGecko                — crypto, documented free tier, attribution.
 *
 * Every returned quote is labelled `delayed` unless the provider states real-time,
 * and carries the provider's own timestamp. A quote whose age we cannot prove is
 * not a quote we will show a client.
 */
import type { HttpClient } from '../http.ts';
import { point, type DataPoint, type Provenance } from '../provenance.ts';

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  /** ISO timestamp reported by the provider, if it reports one. */
  providerTime: string | null;
  /** `realtime` | `delayed` | `eod` — what the provider actually promises. */
  timeliness: 'realtime' | 'delayed' | 'eod';
  previousClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  name?: string;
  exchange?: string;
  assetClass: 'equity' | 'etf' | 'index' | 'crypto';
}

export interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: {
        currency?: string;
        symbol?: string;
        exchangeName?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketTime?: number;
        regularMarketVolume?: number;
        longName?: string;
        shortName?: string;
        instrumentType?: string;
        dataGranularity?: string;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }> };
    }>;
    error?: { code: string; description: string } | null;
  };
}

export class MarketSource {
  readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /** Equity/ETF/index quote via Nasdaq, falling back to Yahoo. */
  async quote(symbol: string, assetClass: Quote['assetClass'] = 'equity'): Promise<DataPoint<Quote>> {
    const upper = symbol.toUpperCase();
    try {
      return await this.#nasdaq(upper, assetClass);
    } catch (primaryError) {
      try {
        return await this.#yahoo(upper, assetClass);
      } catch {
        // Surface the primary failure: it is the one an operator can act on.
        throw primaryError;
      }
    }
  }

  async #nasdaq(symbol: string, assetClass: Quote['assetClass']): Promise<DataPoint<Quote>> {
    const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetClass === 'etf' ? 'etf' : 'stocks'}`;
    const res = await this.http.getJson<{
      data: {
        symbol: string;
        companyName?: string;
        primaryData?: { lastSalePrice?: string; netChange?: string; percentageChange?: string; volume?: string; lastTradeTimestamp?: string; deltaIndicator?: string };
        secondaryData?: { lastSalePrice?: string; netChange?: string; percentageChange?: string; volume?: string; lastTradeTimestamp?: string };
        exchange?: string;
        stockType?: string | null;
        marketStatus?: string;
      } | null;
    }>(url, {
      headers: { Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' },
      ttlMs: 60 * 1000,
      staleIfErrorMs: 15 * 60 * 1000,
      timeoutMs: 8_000,
    });

    const d = res.json.data;
    const primary = d?.primaryData ?? d?.secondaryData;
    const price = parseMoney(primary?.lastSalePrice);
    if (!d || !primary || price === null) throw new Error(`nasdaq: no price for ${symbol}`);

    return point(
      {
        symbol: d.symbol,
        name: d.companyName,
        exchange: d.exchange,
        price,
        currency: 'USD',
        providerTime: parseUsTimestamp(primary.lastTradeTimestamp),
        timeliness: /real.?time/i.test(d.marketStatus ?? '') ? 'realtime' : 'delayed',
        change: parseMoney(primary.netChange) ?? undefined,
        changePercent: parsePercent(primary.percentageChange) ?? undefined,
        volume: parseMoney(primary.volume) ?? undefined,
        assetClass,
      },
      {
        source: 'nasdaq:quote',
        sourceKind: 'live',
        sourceUrl: url,
        retrievedAt: res.retrievedAt,
        asOf: parseUsTimestamp(primary.lastTradeTimestamp),
        license: 'Nasdaq public quote endpoint — delayed data, display attribution required',
        method: 'Nasdaq public quote API; prices are delayed unless the provider reports real-time market status.',
        staleAfterSeconds: 60,
      },
    );
  }

  async #yahoo(symbol: string, assetClass: Quote['assetClass']): Promise<DataPoint<Quote>> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await this.http.getJson<YahooChartResponse>(url, {
      ttlMs: 60 * 1000,
      staleIfErrorMs: 15 * 60 * 1000,
      timeoutMs: 8_000,
    });
    const result = res.json.chart.result?.[0];
    const meta = result?.meta;
    if (!result || !meta || typeof meta.regularMarketPrice !== 'number') {
      throw new Error(`yahoo: no price for ${symbol}`);
    }
    const previousClose = meta.chartPreviousClose ?? meta.previousClose;
    const price = meta.regularMarketPrice;
    return point(
      {
        symbol: meta.symbol ?? symbol,
        name: meta.longName ?? meta.shortName,
        exchange: meta.exchangeName,
        price,
        currency: meta.currency ?? 'USD',
        providerTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
        timeliness: 'delayed',
        previousClose,
        change: previousClose !== undefined ? price - previousClose : undefined,
        changePercent: previousClose ? ((price - previousClose) / previousClose) * 100 : undefined,
        volume: meta.regularMarketVolume,
        assetClass,
      },
      {
        source: 'yahoo:chart',
        sourceKind: 'live',
        sourceUrl: url,
        retrievedAt: res.retrievedAt,
        asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
        license: 'Yahoo Finance public chart endpoint — undocumented; delayed; display with attribution. Not for redistribution.',
        method:
          'Yahoo Finance chart API (undocumented). Used only as a fallback when the documented exchange endpoint is unavailable; quote is delayed.',
        staleAfterSeconds: 60,
      },
    );
  }

  /** Daily close history for the Monte Carlo engine's real-return calibration. */
  async dailyHistory(symbol: string, range: '1y' | '5y' | '10y' | 'max' = '10y') {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const res = await this.http.getJson<YahooChartResponse>(url, {
      ttlMs: 12 * 3600 * 1000,
      staleIfErrorMs: 7 * 24 * 3600 * 1000,
      timeoutMs: 20_000,
    });
    const result = res.json.chart.result?.[0];
    const ts = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const rows: Array<{ date: string; close: number }> = [];
    for (let i = 0; i < ts.length; i++) {
      const close = closes[i];
      const t = ts[i];
      if (typeof close !== 'number' || typeof t !== 'number') continue;
      rows.push({ date: new Date(t * 1000).toISOString().slice(0, 10), close });
    }
    if (rows.length === 0) throw new Error(`yahoo: no history for ${symbol}`);
    return point(rows, {
      source: `yahoo:history:${symbol}`,
      sourceKind: 'live' as const,
      sourceUrl: url,
      retrievedAt: res.retrievedAt,
      asOf: rows[rows.length - 1]?.date ?? null,
      license: 'Yahoo Finance public chart endpoint — undocumented; delayed; internal calibration use only.',
      method: `Daily close history (${range}) for ${symbol}, unadjusted.`,
      staleAfterSeconds: 12 * 3600,
    });
  }

  async cryptoQuote(ids: string[], vs = 'usd'): Promise<DataPoint<Record<string, { usd: number; lastUpdated: string | null }>>> {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=${vs}&include_last_updated_at=true`;
    const res = await this.http.getJson<Record<string, { usd: number; last_updated_at?: number }>>(url, {
      ttlMs: 60 * 1000,
      staleIfErrorMs: 15 * 60 * 1000,
    });
    const value: Record<string, { usd: number; lastUpdated: string | null }> = {};
    for (const [id, v] of Object.entries(res.json)) {
      value[id] = {
        usd: v.usd,
        lastUpdated: v.last_updated_at ? new Date(v.last_updated_at * 1000).toISOString() : null,
      };
    }
    return point(value, {
      source: 'coingecko:simple_price',
      sourceKind: 'live' as const,
      sourceUrl: url,
      retrievedAt: res.retrievedAt,
      asOf: Object.values(value)[0]?.lastUpdated ?? null,
      license: 'CoinGecko API — free tier; attribution required, no redistribution as a data feed',
      method: 'CoinGecko simple price endpoint, USD.',
      staleAfterSeconds: 60,
    });
  }
}

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parsePercent(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Nasdaq timestamps look like `Nov 7, 2026 4:00 PM ET`. Unparseable -> null, never "now". */
function parseUsTimestamp(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s*ET\s*$/i, '').trim();
  const ms = Date.parse(cleaned);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Provenance helper used by the quote aggregator in the API layer. */
export const quoteProvenance = (q: DataPoint<Quote>): Provenance => q.provenance;
