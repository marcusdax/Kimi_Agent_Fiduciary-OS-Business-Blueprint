import { logger } from '../utils/logger';
import { assertPlaceholdersAllowed, combineSources, type DataSource } from '../utils/dataSource';
import { AI_SYSTEM_PROMPT, minimizeForAi } from './aiGuardrails';

// =============================================================================
// UNIFIED DATA SERVICE
// =============================================================================
// 1. Kimi API (Moonshot AI)  — educational AI text, behind services/aiGateway.ts
// 2. Alpha Vantage           — market quotes; static mock values outside production
// 3. Insurance illustrations — formula-based estimates with anonymised carriers.
//    There is NO carrier or quoting-partner integration. Nothing here is a quote.
// =============================================================================

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
  source: DataSource;
}

interface InsuranceIllustration {
  carrier: string;
  productType: 'term';
  coverageAmount: number;
  monthlyPremium: number;
  annualPremium: number;
  termLength: number;
  underwritingClass: 'preferred-plus' | 'preferred' | 'standard-plus' | 'standard';
  illustrative: true;
}

interface AIInsight {
  insight: string;
  reasoning?: string;
  confidence: number | null;
  actionItems: string[];
  riskLevel: 'low' | 'medium' | 'high' | null;
  sources?: string[];
}

interface PortfolioAnalytics {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  topHoldings: Array<{
    symbol: string;
    name: string;
    value: number;
    allocation: number;
    return: number;
  }>;
  /** Metrics this endpoint does not compute yet; listed so clients never invent them. */
  unavailableMetrics: string[];
  source: DataSource;
}

export const INSURANCE_ILLUSTRATION_DISCLAIMER =
  'Illustrative estimates only. These are not quotes or offers from any insurer. Carrier names ' +
  'are anonymised placeholders and premiums come from a simplified formula, not from carrier ' +
  'rate filings. Actual coverage and pricing depend on underwriting and are available only ' +
  'through a licensed insurance producer.';

// =============================================================================
// KIMI API INTEGRATION (Moonshot AI)
// =============================================================================

export type KimiInsightType = 'profile' | 'portfolio' | 'retirement' | 'symphony' | 'market';

export interface KimiResult {
  insight: AIInsight;
  source: DataSource;
  model: string | null;
  prompt: string;
}

export async function generateKimiInsight(
  type: KimiInsightType,
  data: unknown,
  options?: { useThinking?: boolean }
): Promise<KimiResult> {
  const prompt = buildKimiPrompt(type, minimizeForAi(data));
  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;

  if (!apiKey) {
    logger.warn('Kimi API key not configured, using fallback text');
    return { insight: getFallbackAIInsight(type), source: 'fallback', model: null, prompt };
  }

  const model = options?.useThinking
    ? process.env.KIMI_THINKING_MODEL || 'kimi-k2-thinking'
    : process.env.KIMI_MODEL || 'kimi-k2-5';

  try {
    const response = await fetch('https://api.moonshot.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `${AI_SYSTEM_PROMPT}\n\nRespond in JSON with these fields:\n- insight: general educational explanation (3-4 paragraphs)\n- reasoning: brief explanation of the considerations (optional)\n- actionItems: 3-5 questions or topics to review with a licensed professional (not instructions to transact)\n- riskLevel: 'low', 'medium', or 'high' describing how complex the situation is`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Kimi API error: ${response.status} - ${error}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return { insight: getFallbackAIInsight(type), source: 'fallback', model: null, prompt };
    }

    try {
      const parsed = JSON.parse(content);
      return {
        insight: {
          insight: parsed.insight || parsed.analysis || content,
          reasoning: parsed.reasoning,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          riskLevel: ['low', 'medium', 'high'].includes(parsed.riskLevel) ? parsed.riskLevel : null,
        },
        source: 'live',
        model,
        prompt,
      };
    } catch {
      return {
        insight: { insight: content, confidence: null, actionItems: [], riskLevel: null },
        source: 'live',
        model,
        prompt,
      };
    }
  } catch (error) {
    logger.error('Kimi API error:', error);
    return { insight: getFallbackAIInsight(type), source: 'fallback', model: null, prompt };
  }
}

export function buildKimiPrompt(type: KimiInsightType, data: unknown): string {
  const dataStr = JSON.stringify(data, null, 2);

  const prompts: Record<KimiInsightType, string> = {
    profile: `Explain in general terms what this financial profile suggests: strengths, gaps worth looking into, and questions to bring to a licensed professional.\n${dataStr}`,
    portfolio: `Describe this portfolio in general educational terms: diversification, costs, and concentration risks a person might ask about. Do not tell the person to buy or sell anything.\n${dataStr}`,
    retirement: `Explain the main retirement-income considerations raised here (withdrawal rate, Social Security timing, longevity, taxes, health costs) as trade-offs and questions, not instructions.\n${dataStr}`,
    symphony: `Organize general educational notes under five headings: (1) Income and cash flow, (2) Investing and risk, (3) Protection, (4) Taxes and legal structures, (5) Estate and legacy. List topics to review and questions for a licensed professional.\n${dataStr}`,
    market: `Summarize what these market figures show in neutral, descriptive terms. Do not forecast prices or suggest trades.\n${dataStr}`,
  };

  return prompts[type];
}

// =============================================================================
// ALPHA VANTAGE - MARKET DATA
// =============================================================================
// Free tier: 25 requests/day, 5 requests/minute.
// =============================================================================

export async function getRealTimeQuote(symbol: string): Promise<MarketData | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    logger.warn('Alpha Vantage API key not configured, using mock data');
    return getMockMarketData(symbol);
  }

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Alpha Vantage error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    const quote = data['Global Quote'];

    if (!quote || Object.keys(quote).length === 0) {
      logger.warn(`No live data for symbol: ${symbol}`);
      return null;
    }

    return {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change']),
      changePercent: parseFloat(String(quote['10. change percent']).replace('%', '')),
      volume: parseInt(quote['06. volume']),
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      previousClose: parseFloat(quote['08. previous close']),
      timestamp: new Date().toISOString(),
      source: 'live',
    };
  } catch (error) {
    logger.error(`Failed to fetch market data for ${symbol}:`, error);
    return getMockMarketData(symbol);
  }
}

export async function getBatchQuotes(symbols: string[]): Promise<MarketData[]> {
  // Alpha Vantage has no batch endpoint on the free tier; fetch one at a time.
  const results: MarketData[] = [];
  const live = Boolean(process.env.ALPHA_VANTAGE_API_KEY);

  for (const symbol of symbols) {
    const data = await getRealTimeQuote(symbol);
    if (data) {
      results.push(data);
    }
    if (live) {
      await sleep(12000); // 5 requests per minute on the free tier
    }
  }

  return results;
}

export async function getTechnicalIndicator(
  symbol: string,
  indicator: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BBANDS',
  interval: '1min' | '5min' | '15min' | '30min' | '60min' | 'daily' = 'daily',
  timePeriod: number = 20
): Promise<unknown> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const url = `https://www.alphavantage.co/query?function=${indicator}&symbol=${encodeURIComponent(symbol)}&interval=${interval}&time_period=${timePeriod}&series_type=close&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Alpha Vantage error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error(`Failed to fetch technical indicator for ${symbol}:`, error);
    return null;
  }
}

// =============================================================================
// INSURANCE ILLUSTRATIONS
// =============================================================================
// Simplified term-life premium formula. No carrier relationship, no rate filings,
// no underwriting. Carriers are anonymised on purpose; do not substitute real names
// until a licensed quoting partner supplies real, permitted quotes.
// =============================================================================

const ILLUSTRATIVE_CARRIERS = [
  { name: 'Illustrative Carrier A', baseRate: 0.75 },
  { name: 'Illustrative Carrier B', baseRate: 0.82 },
  { name: 'Illustrative Carrier C', baseRate: 0.85 },
  { name: 'Illustrative Carrier D', baseRate: 0.88 },
  { name: 'Illustrative Carrier E', baseRate: 0.9 },
  { name: 'Illustrative Carrier F', baseRate: 0.95 },
];

export function getInsuranceIllustrations(
  age: number,
  gender: 'male' | 'female',
  healthClass: InsuranceIllustration['underwritingClass'],
  coverageAmount: number,
  termLength: 10 | 15 | 20 | 30,
  tobacco: boolean = false
): { illustrations: InsuranceIllustration[]; source: DataSource; disclaimer: string } {
  const healthMultipliers: Record<string, number> = {
    'preferred-plus': 1.0,
    preferred: 1.15,
    'standard-plus': 1.35,
    standard: 1.6,
  };

  const ageMultiplier = 1 + (age - 30) * 0.04;
  const genderMultiplier = gender === 'male' ? 1.15 : 1.0;
  const tobaccoMultiplier = tobacco ? 2.5 : 1.0;
  const healthMult = healthMultipliers[healthClass] || 1.5;

  const illustrations = ILLUSTRATIVE_CARRIERS.map(carrier => {
    const annualRate =
      (coverageAmount / 1000) * carrier.baseRate * ageMultiplier * genderMultiplier * tobaccoMultiplier * healthMult;

    return {
      carrier: carrier.name,
      productType: 'term' as const,
      coverageAmount,
      monthlyPremium: Math.round((annualRate / 12) * 100) / 100,
      annualPremium: Math.round(annualRate * 100) / 100,
      termLength,
      underwritingClass: healthClass,
      illustrative: true as const,
    };
  }).sort((a, b) => a.monthlyPremium - b.monthlyPremium);

  return { illustrations, source: 'illustrative', disclaimer: INSURANCE_ILLUSTRATION_DISCLAIMER };
}

// =============================================================================
// PORTFOLIO ANALYTICS
// =============================================================================

export async function getPortfolioAnalytics(
  holdings: Array<{ symbol: string; quantity: number; avgCost: number }>
): Promise<PortfolioAnalytics> {
  const marketData = await Promise.all(holdings.map(h => getRealTimeQuote(h.symbol)));

  let totalValue = 0;
  let totalCost = 0;
  let dayChange = 0;
  const sources: DataSource[] = [];
  const topHoldings: PortfolioAnalytics['topHoldings'] = [];

  holdings.forEach((holding, i) => {
    const data = marketData[i];
    if (!data) return;

    sources.push(data.source);
    const value = holding.quantity * data.price;
    const cost = holding.quantity * holding.avgCost;
    totalValue += value;
    totalCost += cost;
    dayChange += holding.quantity * data.change;

    topHoldings.push({
      symbol: holding.symbol,
      name: getCompanyName(holding.symbol),
      value,
      allocation: 0,
      return: holding.avgCost > 0 ? ((data.price - holding.avgCost) / holding.avgCost) * 100 : 0,
    });
  });

  topHoldings.forEach(h => {
    h.allocation = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
  });
  topHoldings.sort((a, b) => b.value - a.value);

  const totalReturn = totalValue - totalCost;
  const previousValue = totalValue - dayChange;

  return {
    totalValue,
    dayChange,
    dayChangePercent: previousValue > 0 ? (dayChange / previousValue) * 100 : 0,
    totalReturn,
    totalReturnPercent: totalCost > 0 ? (totalReturn / totalCost) * 100 : 0,
    topHoldings: topHoldings.slice(0, 10),
    unavailableMetrics: ['beta', 'sharpeRatio', 'volatility', 'maxDrawdown', 'assetClassAllocation', 'sectorAllocation'],
    source: combineSources(sources),
  };
}

// =============================================================================
// PLACEHOLDERS (development only; refused in production)
// =============================================================================

function getFallbackAIInsight(type: KimiInsightType): AIInsight {
  const preface = 'Sample text (no AI model is connected). ';
  const insights: Record<KimiInsightType, AIInsight> = {
    profile: {
      insight: `${preface}A financial profile is usually reviewed across emergency savings, retirement saving rate, debt, insurance coverage, and whether investments fit the time horizon.`,
      confidence: null,
      actionItems: [
        'How many months of expenses does the emergency reserve cover?',
        'Is the current saving rate on track for the retirement goal?',
        'Does existing insurance coverage still fit the household?',
      ],
      riskLevel: null,
    },
    portfolio: {
      insight: `${preface}Portfolio reviews commonly look at diversification, the total cost of funds held, concentration in single holdings, and fit with the time horizon.`,
      confidence: null,
      actionItems: [
        'What is the total annual cost of the funds held?',
        'Does any single holding dominate overall risk?',
        'What would the tax consequences of any change be?',
      ],
      riskLevel: null,
    },
    retirement: {
      insight: `${preface}Retirement income planning balances withdrawal rate, Social Security timing, expected lifespan, taxes across account types, and health-care costs.`,
      confidence: null,
      actionItems: [
        'What withdrawal rate does the current plan assume?',
        'How do different Social Security claiming ages change lifetime income?',
        'Which accounts should be drawn first for tax purposes?',
      ],
      riskLevel: null,
    },
    symphony: {
      insight: `${preface}A whole-picture review covers five areas: income and cash flow, investing, protection, taxes, and estate planning.`,
      confidence: null,
      actionItems: [
        'Review cash flow and savings rate',
        'Review insurance coverage relative to need',
        'Review beneficiary designations and core estate documents',
      ],
      riskLevel: null,
    },
    market: {
      insight: `${preface}Market summaries describe recent index moves; they are not forecasts.`,
      confidence: null,
      actionItems: ['Compare any market move to the time horizon of the plan'],
      riskLevel: null,
    },
  };

  return insights[type];
}

/** Fixed placeholder prices with zero change. Clearly not market data. */
const MOCK_PRICES: Record<string, number> = {
  VTI: 100, VXUS: 50, BND: 70, VOO: 400, QQQ: 400, SPY: 500, DIA: 400, IWM: 200,
  AAPL: 100, MSFT: 100, GOOGL: 100, AMZN: 100, TSLA: 100, META: 100, NVDA: 100, JPM: 100, JNJ: 100,
};

function getMockMarketData(symbol: string): MarketData | null {
  assertPlaceholdersAllowed('Market data');

  const price = MOCK_PRICES[symbol];
  if (price === undefined) {
    return null;
  }

  return {
    symbol,
    price,
    change: 0,
    changePercent: 0,
    volume: 0,
    open: price,
    high: price,
    low: price,
    previousClose: price,
    timestamp: new Date().toISOString(),
    source: 'mock',
  };
}

function getCompanyName(symbol: string): string {
  const names: Record<string, string> = {
    VTI: 'Vanguard Total Stock Market ETF',
    VXUS: 'Vanguard Total International Stock ETF',
    BND: 'Vanguard Total Bond Market ETF',
    VOO: 'Vanguard S&P 500 ETF',
    QQQ: 'Invesco QQQ Trust',
    SPY: 'SPDR S&P 500 ETF Trust',
    AAPL: 'Apple Inc.',
    MSFT: 'Microsoft Corporation',
    GOOGL: 'Alphabet Inc.',
    AMZN: 'Amazon.com Inc.',
    TSLA: 'Tesla Inc.',
    META: 'Meta Platforms Inc.',
    NVDA: 'NVIDIA Corporation',
    JPM: 'JPMorgan Chase & Co.',
    JNJ: 'Johnson & Johnson',
  };
  return names[symbol] || symbol;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { type MarketData, type InsuranceIllustration, type AIInsight, type PortfolioAnalytics };
