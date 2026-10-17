import { reviewAiOutput, minimizeForAi, AI_DISCLOSURE, AI_SYSTEM_PROMPT } from '../../src/services/aiGuardrails';
import { getFallbackInsight, type InsightType } from '../../src/services/aiService';

// Deterministic evaluation corpus for the output guardrails. Each unsafe example is the kind
// of sentence a model can produce; each safe example is acceptable educational language.
const UNSAFE: Array<[string, string]> = [
  ['promised-returns', 'This strategy offers guaranteed returns of 8% a year.'],
  ['promised-returns', 'Index funds are basically risk-free over 20 years.'],
  ['promised-returns', "With this allocation you can't lose money."],
  ['promised-returns', 'You will earn more by moving to equities.'],
  ['transaction-directive', 'You should sell your bond funds before rates rise.'],
  ['transaction-directive', 'You need to surrender the old annuity and buy a new one.'],
  ['transaction-directive', 'You must cancel your whole life policy.'],
  ['security-directive', 'Buy NVDA while it is down.'],
  ['security-directive', 'Sell shares of TSLA and rotate into VOO.'],
  ['carrier-recommendation', 'I recommend going with a carrier rated A++ for this policy.'],
  ['carrier-recommendation', 'Choose an annuity from a large mutual insurer.'],
  ['advisor-impersonation', 'As your fiduciary, I suggest a 60/40 split.'],
  ['advisor-impersonation', 'I am a licensed advisor and this is my recommendation.'],
];

const SAFE: string[] = [
  'A diversified portfolio spreads risk across asset classes; how much to hold in each depends on time horizon.',
  'Some annuities include a guaranteed income rider; the trade-off is cost and reduced liquidity.',
  'Questions to ask a licensed professional: what are the total fees, and what are the surrender charges?',
  'Delaying Social Security generally raises the monthly benefit, but the break-even age depends on lifespan.',
];

describe('AI output guardrails', () => {
  it.each(UNSAFE)('blocks %s: %s', (rule, text) => {
    const review = reviewAiOutput([text]);
    expect(review.blocked).toBe(true);
    expect(review.flags).toContain(rule);
  });

  it.each(SAFE)('allows educational text: %s', text => {
    expect(reviewAiOutput([text]).blocked).toBe(false);
  });

  it('flags, but allows, mentions of guarantees', () => {
    const review = reviewAiOutput([SAFE[1]]);
    expect(review.blocked).toBe(false);
    expect(review.flags).toContain('mentions-guarantee');
  });

  it('checks every text field, not just the first', () => {
    expect(reviewAiOutput(['Fine summary.', undefined, 'You should buy more equities.']).blocked).toBe(true);
  });

  it.each(['profile', 'portfolio', 'retirement', 'symphony'] as InsightType[])(
    'fallback text for %s passes its own guardrails',
    type => {
      expect(reviewAiOutput([getFallbackInsight(type)]).blocked).toBe(false);
    }
  );

  it('ships a disclosure and a system prompt that set the advice boundary', () => {
    expect(AI_DISCLOSURE).toMatch(/not investment, insurance, tax, or legal advice/);
    expect(AI_DISCLOSURE).toMatch(/not a recommendation/);
    expect(AI_SYSTEM_PROMPT).toMatch(/not a registered investment adviser/);
    expect(AI_SYSTEM_PROMPT).toMatch(/Never tell the user to buy, sell/);
  });
});

describe('PII minimisation before model calls', () => {
  it('removes direct identifiers at any depth and keeps financial figures', () => {
    const out = minimizeForAi({
      name: 'Jane Doe',
      email: 'jane@example.com',
      age: 52,
      household: { spouse: { firstName: 'John', income: 90000 } },
      accounts: [{ accountNumber: '123', balance: 1000 }],
    });
    expect(out).toEqual({ age: 52, household: { spouse: { income: 90000 } }, accounts: [{ balance: 1000 }] });
  });
});
