/**
 * SEC EDGAR — primary-source disclosure data.
 *
 * For a fiduciary product, "where did this number come from" should eventually
 * reach an *audited filing*, not a vendor's restatement. EDGAR gives us that for
 * free, on the condition that we behave:
 *
 *   - identify ourselves in `User-Agent` (SEC's documented requirement),
 *   - stay under 10 requests/second,
 *   - never cache-bust.
 *
 * What we use it for:
 *   - `submissions`   filing history + upcoming filing calendar per issuer
 *   - `companyfacts`  XBRL fundamentals straight from the filing
 *   - `fullTextSearch` disclosure monitoring: "which of my clients' issuers just
 *     disclosed a material weakness / going-concern / cyber incident?"
 *
 * The last one is the feature the prototype is missing entirely: advisory firms
 * pay for disclosure monitoring, and EDGAR full-text search is the free primary
 * source for it.
 */
import type { HttpClient } from '../http.ts';
import { point } from '../provenance.ts';

export const SEC_LICENSE = 'Public domain — US SEC EDGAR filings (attribution + fair-access policy apply)';

/** SEC requires a descriptive UA. Configure `SEC_USER_AGENT` in production. */
export const defaultSecUserAgent = (): string =>
  process.env.SEC_USER_AGENT ?? 'FiduciaryOS/1.0 (compliance-monitoring; contact@fiduciary-os.example)';

export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
  items?: string;
  size?: number;
  isXBRL?: number;
  isInlineXBRL?: number;
}

export interface SecSubmissions {
  cik: string;
  entityName?: string;
  name?: string;
  tickers: string[];
  exchanges: string[];
  sicDescription: string;
  filings: {
    recent: Record<string, Array<string | number>>;
    files?: Array<{ name: string; filingCount: number; filingFrom: string; filingTo: string }>;
  };
}

/** Normalise a ticker or bare CIK into EDGAR's zero-padded 10-digit CIK. */
export function toCik(input: string | number): string {
  const digits = String(input).replace(/\D/g, '');
  if (!digits) throw new Error(`cannot derive a CIK from "${input}"`);
  return digits.padStart(10, '0');
}

/** Turn the column-oriented `filings.recent` block into one object per filing. */
export function flattenRecentFilings(recent: Record<string, Array<string | number>>): SecFiling[] {
  const forms = recent.form ?? [];
  const out: SecFiling[] = [];
  for (let i = 0; i < forms.length; i++) {
    out.push({
      accessionNumber: String(recent.accessionNumber?.[i] ?? ''),
      filingDate: String(recent.filingDate?.[i] ?? ''),
      reportDate: String(recent.reportDate?.[i] ?? ''),
      form: String(recent.form?.[i] ?? ''),
      primaryDocument: String(recent.primaryDocument?.[i] ?? ''),
      primaryDocDescription: String(recent.primaryDocDescription?.[i] ?? ''),
      items: String(recent.items?.[i] ?? ''),
      size: Number(recent.size?.[i] ?? 0),
      isXBRL: Number(recent.isXBRL?.[i] ?? 0),
      isInlineXBRL: Number(recent.isInlineXBRL?.[i] ?? 0),
    });
  }
  return out;
}

export interface XbrlFact {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyFacts {
  cik: number;
  entityName?: string;
  name?: string;
  facts: Record<string, Record<string, { label: string; units: Record<string, XbrlFact[]> }>>;
}

export class SecSource {
  readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async submissions(cikLike: string | number) {
    const cik = toCik(cikLike);
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const res = await this.http.getJson<SecSubmissions>(url, {
      headers: { 'User-Agent': defaultSecUserAgent(), 'Accept-Encoding': 'gzip, deflate' },
      ttlMs: 6 * 3600 * 1000,
      staleIfErrorMs: 30 * 24 * 3600 * 1000,
    });
    const filings = flattenRecentFilings(res.json.filings.recent);
    return point(
      {
        ...res.json,
        // EDGAR is inconsistent here: some payloads carry `entityName`, others `name`.
        // Normalising at the boundary keeps that wart out of every consumer.
        entityName: res.json.entityName ?? res.json.name ?? `CIK ${cik}`,
        filings,
      },
      {
      source: `sec:submissions:${cik}`,
      sourceKind: 'live' as const,
      sourceUrl: url,
      retrievedAt: res.retrievedAt,
      asOf: filings[0]?.filingDate ?? null,
      license: SEC_LICENSE,
      method: 'SEC EDGAR submissions index; filing columns flattened to one record per filing.',
      staleAfterSeconds: 6 * 3600,
    });
  }

  async companyFacts(cikLike: string | number) {
    const cik = toCik(cikLike);
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await this.http.getJson<CompanyFacts>(url, {
      headers: { 'User-Agent': defaultSecUserAgent(), 'Accept-Encoding': 'gzip, deflate' },
      ttlMs: 12 * 3600 * 1000,
      staleIfErrorMs: 30 * 24 * 3600 * 1000,
      timeoutMs: 20_000,
    });
    return point(res.json, {
      source: `sec:companyfacts:${cik}`,
      sourceKind: 'live' as const,
      sourceUrl: url,
      retrievedAt: res.retrievedAt,
      asOf: new Date().toISOString().slice(0, 10),
      license: SEC_LICENSE,
      method: 'SEC XBRL company facts as filed (not adjusted or restated by us).',
      staleAfterSeconds: 12 * 3600,
    });
  }

  /**
   * Ticker -> zero-padded CIK, from EDGAR's own mapping file.
   *
   * Gap 8: every SEC feature needs a CIK while the platform stores tickers, and a
   * wrong CIK silently monitors the wrong company. EDGAR publishes the mapping, so
   * there is no reason to guess; it changes rarely, so a 7-day cache is generous.
   */
  async tickerMap() {
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const res = await this.http.getJson<Record<string, { cik_str: number; ticker: string; title: string }>>(url, {
      headers: { 'User-Agent': defaultSecUserAgent() },
      ttlMs: 7 * 24 * 3600 * 1000,
      staleIfErrorMs: 90 * 24 * 3600 * 1000,
      timeoutMs: 20_000,
    });
    const byTicker = new Map<string, { cik: string; title: string }>();
    for (const row of Object.values(res.json)) {
      byTicker.set(row.ticker.toUpperCase(), { cik: toCik(row.cik_str), title: row.title });
    }
    return point(byTicker, {
      source: 'sec:company_tickers',
      sourceKind: 'live' as const,
      sourceUrl: url,
      retrievedAt: res.retrievedAt,
      asOf: new Date().toISOString().slice(0, 10),
      license: SEC_LICENSE,
      method: 'EDGAR company_tickers.json, normalised to an upper-case ticker key and a zero-padded CIK.',
      staleAfterSeconds: 7 * 24 * 3600,
    });
  }

  /** Resolve one ticker, with an explicit error rather than a silent undefined. */
  async cikForTicker(ticker: string): Promise<{ cik: string; title: string }> {
    const map = await this.tickerMap();
    const hit = map.value.get(ticker.toUpperCase());
    if (!hit) throw new Error(`ticker ${ticker} is not in the EDGAR company ticker map`);
    return hit;
  }

  async fullTextSearch(query: string, opts: { forms?: string[]; startdt?: string; enddt?: string; from?: number; ciks?: string[] } = {}) {
    const params = new URLSearchParams({ q: query });
    if (opts.forms?.length) params.set('forms', opts.forms.join(','));
    if (opts.startdt) params.set('startdt', opts.startdt);
    if (opts.enddt) params.set('enddt', opts.enddt);
    if (opts.from !== undefined) params.set('from', String(opts.from));
    if (opts.ciks?.length) params.set('ciks', opts.ciks.join(','));
    const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;

    const res = await this.http.getJson<{
      hits: { total: { value: number }; hits: Array<{ _id: string; _source: Record<string, unknown> }> };
    }>(url, {
      headers: { 'User-Agent': defaultSecUserAgent() },
      ttlMs: 60 * 60 * 1000,
      staleIfErrorMs: 24 * 3600 * 1000,
    });

    return point(
      {
        total: res.json.hits.total.value,
        hits: res.json.hits.hits.map((h) => ({
          id: h._id,
          form: String(h._source.form ?? ''),
          filed: String(h._source.file_date ?? ''),
          entity: String(h._source.display_names ?? ''),
          url: `https://www.sec.gov/Archives/edgar/data/${String(h._id).split(':')[0]}/${String(h._id).split(':')[1]}`,
        })),
      },
      {
        source: 'sec:fulltext',
        sourceKind: 'live' as const,
        sourceUrl: url,
        retrievedAt: res.retrievedAt,
        asOf: new Date().toISOString().slice(0, 10),
        license: SEC_LICENSE,
        method: `EDGAR full-text search for ${JSON.stringify(query)}.`,
        staleAfterSeconds: 3600,
      },
    );
  }
}
