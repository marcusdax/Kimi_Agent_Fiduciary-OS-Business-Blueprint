import { z } from 'zod';

const finiteString = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/)
  .transform(Number)
  .refine(Number.isFinite);
const positive = z.number().finite().positive().max(1e12);
const cryptoSchema = z.object(
  Object.fromEntries(
    ['bitcoin', 'ethereum', 'ripple', 'solana', 'cardano'].map(key => [
      key,
      z.object({ usd: positive, last_updated_at: z.number().int().positive() }),
    ])
  )
);
const historySchema = z.object({
  prices: z
    .array(z.tuple([z.number().int().positive().max(Date.UTC(2100, 0)), positive]))
    .min(2)
    .max(1000),
});
const treasurySchema = z.object({
  data: z
    .array(
      z.object({
        record_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine(
            v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
          ),
        security_desc: z.literal('Treasury Bills'),
        avg_interest_rate_amt: finiteString.refine(n => n >= 0 && n <= 100),
      })
    )
    .min(1)
    .max(12),
});
export const providers = {
  crypto: {
    name: 'CoinGecko USD observations',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple,solana,cardano&vs_currencies=usd&include_last_updated_at=true',
    ttl: 900000,
    maxAge: 86400000,
    maxObservationAge: 1800000,
    unit: 'USD per coin',
    currency: 'USD',
  },
  cryptoHistory: {
    name: 'CoinGecko Bitcoin 30-day history',
    url: 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=30&interval=daily',
    ttl: 86400000,
    maxAge: 86400000,
    maxObservationAge: 172800000,
    unit: 'USD per BTC',
    currency: 'USD',
  },
  treasury: {
    name: 'U.S. Treasury average interest on outstanding bills',
    url: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?filter=security_desc:eq:Treasury%20Bills&sort=-record_date&page[size]=12',
    ttl: 21600000,
    maxAge: 604800000,
    maxObservationAge: 6048000000,
    unit: 'percent per year (outstanding debt average, not current market yield)',
    currency: null,
  },
};
export type ObservationKey = keyof typeof providers;
export type Point = { label: string; value: number; observedAt: string };
export function parseObservation(key: ObservationKey, raw: unknown, now: number): Point[] {
  let points: Point[];
  if (key === 'crypto') {
    const parsed = cryptoSchema.parse(raw);
    const symbols: Record<string, string> = {
      bitcoin: 'BTC',
      ethereum: 'ETH',
      ripple: 'XRP',
      solana: 'SOL',
      cardano: 'ADA',
    };
    points = Object.entries(parsed).map(([coin, row]) => ({
      label: symbols[coin],
      value: row.usd,
      observedAt: new Date(row.last_updated_at * 1000).toISOString(),
    }));
  } else if (key === 'cryptoHistory')
    points = historySchema
      .parse(raw)
      .prices.map(([time, value]) => ({
        label: new Date(time).toISOString().slice(0, 10),
        value,
        observedAt: new Date(time).toISOString(),
      }))
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  else
    points = treasurySchema
      .parse(raw)
      .data.map(row => ({
        label: row.record_date,
        value: row.avg_interest_rate_amt,
        observedAt: row.record_date,
      }))
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (
    points.some(
      p =>
        !Number.isFinite(Date.parse(p.observedAt)) ||
        Date.parse(p.observedAt) > now + 300000 ||
        Date.parse(p.observedAt) < Date.UTC(2000, 0)
    )
  )
    throw new Error('Invalid observation timestamp');
  return points;
}
export function createObservationService(fetcher: typeof fetch = fetch, clock = Date.now) {
  const cache = new Map<ObservationKey, { points: Point[]; fetched: number }>();
  const pending = new Map<ObservationKey, Promise<void>>();
  const retryAfter = new Map<ObservationKey, number>();
  const failures = new Set<ObservationKey>();
  async function refresh(key: ObservationKey) {
    const config = providers[key];
    try {
      const response = await fetcher(config.url, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Upstream unavailable');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing body');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (size <= 1000000) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1000000) throw new Error('Oversized response');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const points = parseObservation(key, JSON.parse(text), clock());
      cache.set(key, { points, fetched: clock() });
      failures.delete(key);
    } catch {
      failures.add(key);
      retryAfter.set(key, clock() + 60000);
    }
  }
  return async function load() {
    await Promise.all(
      (Object.keys(providers) as ObservationKey[]).map(async key => {
        const existing = cache.get(key);
        if (
          (!existing || clock() - existing.fetched >= providers[key].ttl) &&
          clock() >= (retryAfter.get(key) ?? 0)
        ) {
          if (!pending.has(key))
            pending.set(
              key,
              refresh(key).finally(() => pending.delete(key))
            );
          await pending.get(key);
        }
      })
    );
    return (Object.keys(providers) as ObservationKey[]).map(key => {
      const config = providers[key],
        entry = cache.get(key),
        now = clock();
      const retained = entry && now - entry.fetched < config.maxAge ? entry : null;
      const latest = retained
        ? Math.max(...retained.points.map(p => Date.parse(p.observedAt)))
        : null;
      const oldest = retained
        ? Math.min(...retained.points.map(p => Date.parse(p.observedAt)))
        : null;
      const observationAge = key === 'crypto' ? oldest : latest;
      const status = !retained
        ? 'unavailable'
        : failures.has(key) ||
            now - retained.fetched >= config.ttl ||
            now - observationAge! > config.maxObservationAge
          ? 'stale'
          : 'fresh';
      return {
        key,
        provider: config.name,
        providerUrl: config.url,
        unit: config.unit,
        currency: config.currency,
        ttlSeconds: config.ttl / 1000,
        fetchedAt: retained ? new Date(retained.fetched).toISOString() : null,
        observedAt:
          retained && key === 'treasury'
            ? retained.points[retained.points.length - 1].observedAt
            : latest
              ? new Date(latest).toISOString()
              : null,
        observationTimePrecision: key === 'treasury' ? 'date' : 'timestamp',
        status,
        error: failures.has(key) ? 'UPSTREAM_UNAVAILABLE_OR_INVALID' : null,
        points: retained?.points ?? [],
      };
    });
  };
}
export const observations = createObservationService();
