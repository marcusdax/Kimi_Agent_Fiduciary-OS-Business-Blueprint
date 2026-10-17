import { logger } from '../utils/logger';
import type { DataSource } from '../utils/dataSource';
import { AI_SYSTEM_PROMPT, minimizeForAi } from './aiGuardrails';

export type InsightType = 'profile' | 'portfolio' | 'retirement' | 'symphony';

export interface AnthropicInsight {
  text: string;
  source: DataSource;
  model: string | null;
  prompt: string;
}

const DEFAULT_MODEL = 'claude-sonnet-5-5';

export async function generateAIInsight(type: InsightType, data: unknown): Promise<AnthropicInsight> {
  const prompt = buildPrompt(type, minimizeForAi(data));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not configured, returning fallback text');
    return { text: getFallbackInsight(type), source: 'fallback', model: null, prompt };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await response.json();
    const text = result.content?.[0]?.text;
    if (typeof text === 'string' && text.trim()) {
      return { text, source: 'live', model, prompt };
    }
    return { text: getFallbackInsight(type), source: 'fallback', model: null, prompt };
  } catch (error) {
    logger.error('AI insight generation failed:', error);
    return { text: getFallbackInsight(type), source: 'fallback', model: null, prompt };
  }
}

export function buildPrompt(type: InsightType, data: unknown): string {
  const dataStr = JSON.stringify(data, null, 2);

  switch (type) {
    case 'profile':
      return `Explain, in 3-4 short paragraphs, what the figures in this financial profile suggest in general terms: strengths, gaps worth looking into, and questions the person could bring to a licensed professional. Do not recommend specific products or transactions.\n\n${dataStr}`;

    case 'portfolio':
      return `Describe this portfolio in general educational terms: how concentrated or diversified it is, what costs or risks a person might ask about, and which questions to raise with a licensed professional. Do not tell the person to buy or sell anything.\n\n${dataStr}`;

    case 'retirement':
      return `Explain the main retirement-income considerations raised by this information (withdrawal rate, timing of Social Security, longevity, taxes, health costs) as trade-offs and questions, not instructions.\n\n${dataStr}`;

    case 'symphony':
      return `Organize general educational notes for this person under five headings: (1) Income and cash flow, (2) Investing, (3) Protection, (4) Taxes, (5) Estate and legacy. Under each, list topics worth reviewing and questions to ask a licensed professional. Do not recommend specific products or transactions.\n\n${dataStr}`;
  }
}

/**
 * Canned, non-personalised text for development when no model is configured.
 * Deliberately free of figures, product names and instructions.
 */
export function getFallbackInsight(type: InsightType): string {
  const preface = 'Sample text (no AI model is connected). ';
  switch (type) {
    case 'profile':
      return `${preface}A financial profile is usually reviewed across a few areas: emergency savings, retirement saving rate, debt, insurance coverage, and how investments match the time horizon. Questions worth asking a licensed professional include whether current savings keep pace with the retirement goal and whether coverage still fits the household.`;
    case 'portfolio':
      return `${preface}Portfolio reviews commonly look at diversification across asset classes and regions, the total cost of funds held, how much any single holding contributes to risk, and whether the mix still fits the time horizon. A licensed professional can help weigh these against tax consequences before any change.`;
    case 'retirement':
      return `${preface}Retirement income planning balances the withdrawal rate against portfolio size, the timing of Social Security, expected lifespan, taxes on different account types, and health-care costs. Each choice involves trade-offs that depend on personal circumstances and are worth reviewing with a licensed professional.`;
    case 'symphony':
      return `${preface}**Income and cash flow:** spending, savings rate, emergency reserve.\n\n**Investing:** diversification, costs, fit with time horizon.\n\n**Protection:** life, disability, and long-term-care coverage relative to need.\n\n**Taxes:** account types and timing of income.\n\n**Estate and legacy:** beneficiary designations and core documents. Each area is worth reviewing with a licensed professional.`;
  }
}
