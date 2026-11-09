import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getBuffer, sanitize, setConsent, track } from './analytics';

beforeEach(() => window.localStorage.clear());

describe('funnel analytics', () => {
  it('records nothing without consent', () => {
    const sink = vi.fn();
    expect(track('visit', {}, sink)).toBe(false);
    expect(sink).not.toHaveBeenCalled();
    expect(getBuffer()).toHaveLength(0);
  });
  it('records allowed events after consent and clears on withdrawal', () => {
    const sink = vi.fn();
    setConsent(true);
    expect(track('calculator_used', { calculator: 'annuity' }, sink)).toBe(true);
    expect(getBuffer()).toHaveLength(1);
    expect(sink).toHaveBeenCalledOnce();
    setConsent(false);
    expect(getBuffer()).toHaveLength(0);
  });
  it('strips anything that is not an allowlisted, simple value (no PII)', () => {
    expect(sanitize({ calculator: 'tax', email: 'a@b.com', amount: 5000, step: 'has space@x' })).toEqual({ calculator: 'tax' });
  });
  it('never throws if the sink fails', () => {
    setConsent(true);
    expect(() => track('registered', {}, () => { throw new Error('x'); })).not.toThrow();
  });
});
