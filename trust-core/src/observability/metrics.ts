/**
 * observability/metrics.ts — a tiny Prometheus-compatible registry.
 *
 * Gap 5: breaker state and cache size were visible only if someone made a request.
 * An operator needs them on a dashboard, and an on-call engineer needs them as
 * alerts. This is 120 lines of counters, gauges and histograms rather than a
 * dependency because the exposition format is trivial and the dependency would sit
 * on the hot path of every request.
 *
 * Deliberately bounded: label cardinality is capped per metric, because unbounded
 * labels (user ids, tickers) are how a metrics pipeline falls over in production.
 */
export type Labels = Record<string, string>;

interface Series {
  labels: Labels;
  value: number;
  /** Histograms only. */
  buckets?: number[];
  sum?: number;
  count?: number;
}

const HISTOGRAM_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000];

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`).join(',');
}

class MetricBase {
  readonly name: string;
  readonly help: string;
  readonly maxSeries: number;
  readonly series = new Map<string, Series>();
  protected dropped = 0;

  constructor(name: string, help: string, maxSeries = 500) {
    this.name = name;
    this.help = help;
    this.maxSeries = maxSeries;
  }

  protected get(labels: Labels): Series | null {
    const key = labelKey(labels);
    let s = this.series.get(key);
    if (!s) {
      if (this.series.size >= this.maxSeries) {
        this.dropped++;
        return null;
      }
      s = { labels, value: 0 };
      this.series.set(key, s);
    }
    return s;
  }

  /** Series dropped due to cardinality limits — alertable in itself. */
  get droppedSeries(): number {
    return this.dropped;
  }
}

export class Counter extends MetricBase {
  inc(labels: Labels = {}, by = 1): void {
    const s = this.get(labels);
    if (s) s.value += by;
  }

  set(labels: Labels, value: number): void {
    const s = this.get(labels);
    if (s) s.value = value;
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const s of this.series.values()) lines.push(`${this.name}${renderLabels(s.labels)} ${s.value}`);
    if (this.dropped > 0) lines.push(`# dropped_series{metric="${this.name}"} ${this.dropped}`);
    return lines.join('\n');
  }
}

export class Gauge extends MetricBase {
  set(labels: Labels, value: number): void {
    const s = this.get(labels);
    if (s) s.value = value;
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const s of this.series.values()) lines.push(`${this.name}${renderLabels(s.labels)} ${s.value}`);
    return lines.join('\n');
  }
}

export class Histogram extends MetricBase {
  observe(valueMs: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    let s = this.series.get(key);
    if (!s) {
      if (this.series.size >= this.maxSeries) {
        this.dropped++;
        return;
      }
      s = { labels, value: 0, buckets: HISTOGRAM_BUCKETS_MS.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    const buckets = s.buckets!;
    for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
      if (valueMs <= HISTOGRAM_BUCKETS_MS[i]!) buckets[i] = (buckets[i] ?? 0) + 1;
    }
    s.sum = (s.sum ?? 0) + valueMs;
    s.count = (s.count ?? 0) + 1;
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const s of this.series.values()) {
      const cumulative = s.buckets ?? [];
      for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
        lines.push(`${this.name}_bucket${renderLabels({ ...s.labels, le: String(HISTOGRAM_BUCKETS_MS[i]) })} ${cumulative[i] ?? 0}`);
      }
      lines.push(`${this.name}_bucket${renderLabels({ ...s.labels, le: '+Inf' })} ${s.count ?? 0}`);
      lines.push(`${this.name}_sum${renderLabels(s.labels)} ${s.sum ?? 0}`);
      lines.push(`${this.name}_count${renderLabels(s.labels)} ${s.count ?? 0}`);
    }
    return lines.join('\n');
  }
}

function renderLabels(labels: Labels): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  return `{${keys.map((k) => `${k}="${String(labels[k]).replace(/"/g, '\\"')}"`).join(',')}}`;
}

export class MetricsRegistry {
  readonly requests = new Counter('fidos_http_requests_total', 'HTTP requests by route, method and status');
  readonly latency = new Histogram('fidos_http_request_duration_ms', 'HTTP request duration in milliseconds');
  readonly upstreamCalls = new Counter('fidos_upstream_calls_total', 'Calls to external data providers');
  readonly upstreamLatency = new Histogram('fidos_upstream_duration_ms', 'External provider call duration in milliseconds');
  readonly breakerState = new Gauge('fidos_circuit_breaker_open', '1 when the provider circuit breaker is open');
  readonly cacheHits = new Counter('fidos_cache_events_total', 'Cache hits, misses and stale serves');
  readonly ledgerAppends = new Counter('fidos_ledger_appends_total', 'Ledger entries appended');
  readonly authFailures = new Counter('fidos_auth_failures_total', 'Rejected authentication attempts by reason');
  readonly rateLimited = new Counter('fidos_rate_limited_total', 'Requests rejected by the rate limiter');
  readonly watcherRuns = new Counter('fidos_disclosure_watch_runs_total', 'Disclosure Watch executions');

  render(): string {
    return [
      this.requests.render(),
      this.latency.render(),
      this.upstreamCalls.render(),
      this.upstreamLatency.render(),
      this.breakerState.render(),
      this.cacheHits.render(),
      this.ledgerAppends.render(),
      this.authFailures.render(),
      this.rateLimited.render(),
      this.watcherRuns.render(),
    ].join('\n');
  }
}

export const metrics = new MetricsRegistry();
