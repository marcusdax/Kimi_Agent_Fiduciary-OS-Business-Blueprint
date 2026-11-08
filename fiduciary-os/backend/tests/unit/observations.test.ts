import {
  createObservationService,
  parseObservation,
  providers,
} from '../../src/services/observations';
const epoch = Date.UTC(2026, 10, 8, 9);
const crypto = Object.fromEntries(
  ['bitcoin', 'ethereum', 'ripple', 'solana', 'cardano'].map(k => [
    k,
    { usd: 123.45, last_updated_at: epoch / 1000 },
  ])
);
const treasury = {
  data: [
    { record_date: '2026-10-31', security_desc: 'Treasury Bills', avg_interest_rate_amt: '4.014' },
  ],
};
const history = {
  prices: [
    [epoch - 86400000, 100],
    [epoch, 110],
  ],
};
describe('public observation safety', () => {
  it('validates actual provider schemas, dates, units and nonzero prices', () => {
    expect(parseObservation('crypto', crypto, epoch)).toHaveLength(5);
    expect(parseObservation('treasury', treasury, epoch)[0].value).toBe(4.014);
    expect(parseObservation('treasury', treasury, epoch)[0].observedAt).toBe('2026-10-31');
    expect(parseObservation('cryptoHistory', history, epoch)).toHaveLength(2);
    expect(() =>
      parseObservation(
        'crypto',
        { ...crypto, bitcoin: { usd: 0, last_updated_at: epoch / 1000 } },
        epoch
      )
    ).toThrow();
    expect(() => parseObservation('crypto', crypto, epoch - 86400000)).toThrow();
    expect(() =>
      parseObservation(
        'treasury',
        { data: [{ ...treasury.data[0], avg_interest_rate_amt: 'null' }] },
        epoch
      )
    ).toThrow();
  });
  it('coalesces, caches, backs off failures and expires stale observations', async () => {
    let now = epoch,
      fail = false;
    const fetcher = jest.fn(async (url: string | URL | Request) => {
      if (fail) throw new Error('Synthetic outage');
      return new Response(
        JSON.stringify(
          String(url) === providers.crypto.url
            ? crypto
            : String(url) === providers.treasury.url
              ? treasury
              : history
        )
      );
    });
    const load = createObservationService(fetcher as typeof fetch, () => now);
    const [first] = await Promise.all([load(), load()]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(first.every(f => f.status === 'fresh')).toBe(true);
    expect(first[0].currency).toBe('USD');
    await load();
    expect(fetcher).toHaveBeenCalledTimes(3);
    now += 901000;
    fail = true;
    const stale = await load();
    expect(stale[0].status).toBe('stale');
    expect(stale[0].points).toHaveLength(5);
    const count = fetcher.mock.calls.length;
    await load();
    expect(fetcher).toHaveBeenCalledTimes(count);
    now += 86400001;
    const expired = await load();
    expect(expired[0].status).toBe('unavailable');
    expect(expired[0].points).toEqual([]);
  });
  it('never substitutes synthetic data on invalid, oversized or failed responses', async () => {
    for (const fetcher of [
      async () => new Response('{}'),
      async () => new Response('x'.repeat(1000001)),
      async () => new Response('', { status: 503 }),
    ]) {
      const feeds = await createObservationService(fetcher as typeof fetch, () => epoch)();
      expect(feeds.every(f => f.status === 'unavailable' && !f.points.length && f.error)).toBe(
        true
      );
    }
  });
});
