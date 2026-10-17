import { logger } from '../utils/logger';

export async function generateAIInsight(type: string, data: unknown): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not configured, returning fallback insight');
    return getFallbackInsight(type, data);
  }

  try {
    const prompt = buildPrompt(type, data);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await response.json();
    return result.content?.[0]?.text || getFallbackInsight(type, data);
  } catch (error) {
    logger.error('AI insight generation failed:', error);
    return getFallbackInsight(type, data);
  }
}

function buildPrompt(type: string, data: unknown): string {
  const dataStr = JSON.stringify(data, null, 2);

  switch (type) {
    case 'profile':
      return `You are a fiduciary financial advisor AI. Analyze this client profile and provide a concise, actionable insight (3-4 paragraphs):
${dataStr}
Provide personalized insights on their financial DNA score, key strengths, gaps, and 3 priority actions.`;

    case 'portfolio':
      return `As a fiduciary portfolio analyst, review this portfolio and provide specific rebalancing and optimization recommendations in 3-4 paragraphs:
${dataStr}`;

    case 'retirement':
      return `As a retirement income specialist, analyze this retirement plan and create a personalized retirement income playbook with withdrawal sequencing, Social Security timing, and risk mitigation strategies:
${dataStr}`;

    case 'symphony':
      return `As the Fiduciary OS™ Symphony AI, create a comprehensive financial playbook. Create a holistic 5-part financial symphony: (1) Income Optimization, (2) Investment Strategy, (3) Protection Planning, (4) Tax Efficiency, (5) Legacy Blueprint. Be specific and actionable.
${dataStr}`;

    default:
      return `Provide financial insights based on this data:
${dataStr}`;
  }
}

function getFallbackInsight(type: string, data: unknown): string {
  // Extract some basic info from data for personalized fallback
  const d = data as Record<string, unknown>;

  switch (type) {
    case 'profile':
      return `Based on your Financial DNA score of ${d?.dnaScore || 72}, you demonstrate strong retirement fundamentals with opportunities to optimize tax efficiency and investment allocation. Your moderate risk profile aligns well with your time horizon. Priority actions: (1) Maximize 401(k) contributions to capture full employer match, (2) Consider Roth conversions in lower income years, (3) Build emergency fund to 6 months expenses.`;

    case 'portfolio':
      return `Based on your moderate risk profile with equity allocation, consider shifting 5-10% from US large cap into international developed markets for diversification. Your expense ratio is above optimal — transitioning to index funds could recover significant fee drag over time. Maintain a 6-month emergency fund before increasing equity exposure.`;

    case 'retirement':
      return `Your retirement income strategy should prioritize Social Security optimization — delaying to age 70 increases your benefit by 32% vs claiming at 62. Consider a bucket strategy: 2 years cash, 8 years bonds, remainder equities.`;

    case 'symphony':
      return `**Your Fiduciary Symphony Playbook**

**1. Income Optimization:** Maximize contributions to tax-advantaged accounts — 401(k) to $23,000, IRA to $7,000.

**2. Investment Strategy:** Maintain balanced equity/bond split. Shift 5% annually toward fixed income starting 10 years pre-retirement.

**3. Protection Planning:** Life insurance gap analysis suggests additional term coverage. Long-term care insurance becomes critical at age 55.

**4. Tax Efficiency:** Roth conversion ladder over next 5 years at current brackets. Harvest losses in December.

**5. Legacy Blueprint:** Establish revocable living trust. Review beneficiary designations annually.`;

    default:
      return 'AI insights are currently unavailable. Please try again later.';
  }
}
