/**
 * features/disclosure-watch.ts — F7: per-holding disclosure monitoring from the
 * primary source.
 *
 * The commercial version of this feature costs real money and is usually a model's
 * paraphrase of a filing. This one does the opposite: it *points* at the filing and
 * never paraphrases it. An advisor reads the primary document; the platform's job is
 * to make sure they knew it existed.
 *
 * Two signals per holding, both from EDGAR:
 *  1. Recent filings of the forms that carry material change (10-K, 10-Q, 8-K,
 *     NT 10-K, 10-K/A …) inside the lookback window.
 *  2. Full-text hits for risk language, scoped to that issuer's CIK — which is what
 *     turns "a filing exists" into "something in it may matter".
 *
 * Design constraints learned from the API:
 *  - EDGAR full-text search fans out; one query per issuer with an OR of phrases is
 *    ~5x cheaper than one query per phrase, and the result is the same.
 *  - The ticker map is cached for a week; a wrong CIK monitors the wrong company,
 *    so an unresolved ticker is reported, never guessed.
 *  - Every hit carries its accession number so the digest deduplicates across runs.
 */
import type { SecSource } from '../sources/sec.ts';
import { derive, type DataPoint } from '../provenance.ts';

export const DEFAULT_RISK_PHRASES = [
  'material weakness',
  'going concern',
  'restatement',
  'cybersecurity incident',
  'material litigation',
  'SEC investigation',
  'delisting',
];

export const DEFAULT_FORMS = ['10-K', '10-Q', '8-K', 'NT 10-K', '10-K/A', '10-Q/A'];

export interface WatchRequest {
  /** Tickers held by the household. Case-insensitive. */
  tickers: string[];
  /** How far back to look, in days. Default 90. */
  lookbackDays?: number;
  /** Restrict to specific form types. */
  forms?: string[];
  /** Override the default risk phrases. Lowercase; matched by EDGAR. */
  phrases?: string[];
  /** Hard cap on issuers per run, to bound provider fan-out. */
  maxIssuers?: number;
}

export interface FilingSummary {
  ticker: string;
  cik: string;
  form: string;
  filed: string;
  accession: string;
  description: string;
  url: string;
}

export interface RiskHit {
  ticker: string;
  cik: string;
  phrase: string;
  form: string;
  filed: string;
  entity: string;
  url: string;
}

export interface WatchReport {
  generatedAt: string;
  lookbackDays: number;
  issuersChecked: number;
  filings: FilingSummary[];
  riskLanguage: RiskHit[];
  unresolved: Array<{ ticker: string; reason: string }>;
  /** Explicit statement of what the run did not cover. */
  coverage: { forms: string[]; phrases: string[]; truncated: boolean };
}

const EDGAR_ARCHIVE = 'https://www.sec.gov/Archives/edgar/data';

function filingUrl(cik: string, accession: string, document: string): string {
  const cikPath = String(Number(cik));
  const accessionPath = accession.replace(/-/g, '');
  return document
    ? `${EDGAR_ARCHIVE}/${cikPath}/${accessionPath}/${document}`
    : `${EDGAR_ARCHIVE}/${cikPath}/${accessionPath}/`;
}

export class DisclosureWatch {
  readonly #sec: SecSource;
  constructor(sec: SecSource) {
    this.#sec = sec;
  }

  async run(request: WatchRequest, now = new Date()): Promise<DataPoint<WatchReport>> {
    const lookbackDays = clamp(request.lookbackDays ?? 90, 1, 730);
    const forms = (request.forms?.length ? request.forms : DEFAULT_FORMS).map((f) => f.toUpperCase());
    const phrases = (request.phrases?.length ? request.phrases : DEFAULT_RISK_PHRASES).map((p) => p.toLowerCase());
    const maxIssuers = clamp(request.maxIssuers ?? 25, 1, 50);
    const tickers = [...new Set(request.tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];

    if (tickers.length === 0) throw new RangeError('at least one ticker is required');
    const truncated = tickers.length > maxIssuers;
    const selected = tickers.slice(0, maxIssuers);

    const start = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
    const map = await this.#sec.tickerMap();

    const filings: FilingSummary[] = [];
    const riskLanguage: RiskHit[] = [];
    const unresolved: Array<{ ticker: string; reason: string }> = [];
    const seen = new Set<string>();

    for (const ticker of selected) {
      const issuer = map.value.get(ticker);
      if (!issuer) {
        unresolved.push({ ticker, reason: 'not present in the EDGAR company ticker map (fund, foreign private issuer, or delisted)' });
        continue;
      }

      const submissions = await this.#sec.submissions(issuer.cik);
      for (const filing of submissions.value.filings) {
        if (!forms.includes(filing.form.toUpperCase())) continue;
        if (filing.filingDate < start) continue;
        const key = `${issuer.cik}:${filing.accessionNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        filings.push({
          ticker,
          cik: issuer.cik,
          form: filing.form,
          filed: filing.filingDate,
          accession: filing.accessionNumber,
          description: filing.primaryDocDescription || filing.form,
          url: filingUrl(issuer.cik, filing.accessionNumber, filing.primaryDocument),
        });
      }

      // One OR'd query per issuer rather than one per phrase.
      const query = phrases.map((p) => `"${p}"`).join(' OR ');
      try {
        const hits = await this.#sec.fullTextSearch(query, { ciks: [issuer.cik], startdt: start, forms: forms.filter((f) => !f.includes('/')) });
        for (const hit of hits.value.hits) {
          const phrase = phrases.find((p) => hit.entity.toLowerCase().includes(p)) ?? phrases[0] ?? 'risk language';
          riskLanguage.push({
            ticker,
            cik: issuer.cik,
            phrase,
            form: hit.form,
            filed: hit.filed,
            entity: hit.entity,
            url: hit.url,
          });
        }
      } catch {
        // A single issuer's full-text failure must not lose the filing list.
        unresolved.push({ ticker, reason: 'filings retrieved, but full-text search failed for this issuer' });
      }
    }

    filings.sort((a, b) => b.filed.localeCompare(a.filed));
    riskLanguage.sort((a, b) => b.filed.localeCompare(a.filed));

    const report: WatchReport = {
      generatedAt: now.toISOString(),
      lookbackDays,
      issuersChecked: selected.length - unresolved.filter((u) => u.reason.startsWith('not present')).length,
      filings,
      riskLanguage,
      unresolved,
      coverage: { forms, phrases, truncated },
    };

    return derive(
      report,
      [map],
      `SEC EDGAR primary-source monitoring: filings of ${forms.join(', ')} filed since ${start}, plus full-text ` +
        `hits for ${phrases.length} risk phrases scoped to each issuer's CIK. No summarisation and no interpretation: ` +
        'the advisor reads the linked filing.',
      'fiduciary-os:disclosure-watch',
    );
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}
