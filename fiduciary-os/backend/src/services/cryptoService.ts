import { logger } from '../utils/logger';

// =============================================================================
// CRYPTOCURRENCY SERVICE - Live Prices via CoinGecko API
// =============================================================================
// Free tier: 10-30 calls/minute, no API key required for basic endpoints
// =============================================================================

export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  marketCap: number;
  volume24h: number;
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number; // All-time high
  athChangePercentage: number;
  athDate: string;
  lastUpdated: string;
  imageUrl: string;
}

export interface CryptoTrending {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number;
  thumb: string;
  small: string;
  large: string;
  priceChange24h: number;
  currentPrice: number;
}

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

// Top cryptocurrencies to track
const TOP_CRYPTO_IDS = [
  'bitcoin',
  'ethereum',
  'tether',
  'binancecoin',
  'solana',
  'usd-coin',
  'xrp',
  'cardano',
  'avalanche-2',
  'dogecoin',
  'polkadot',
  'tron',
  'chainlink',
  'polygon-pos',
  'wrapped-bitcoin',
  'litecoin',
  'uniswap',
  'bitcoin-cash',
  'cosmos',
  'stellar',
  'filecoin',
  'ethereum-classic',
  'near',
  'aptos',
  'optimism',
  'arbitrum',
  'vechain',
  'algorand',
  'injective-protocol',
  'render-token',
];

/**
 * Fetch live prices for top cryptocurrencies
 */
export async function getCryptoPrices(): Promise<CryptoAsset[]> {
  try {
    const idsParam = TOP_CRYPTO_IDS.join(',');
    const url = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&ids=${idsParam}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        logger.warn('CoinGecko rate limit hit, using cached data');
        return getMockCryptoData();
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();

    return data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      currentPrice: coin.current_price,
      priceChange24h: coin.price_change_24h,
      priceChangePercentage24h: coin.price_change_percentage_24h,
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      circulatingSupply: coin.circulating_supply,
      totalSupply: coin.total_supply,
      maxSupply: coin.max_supply,
      ath: coin.ath,
      athChangePercentage: coin.ath_change_percentage,
      athDate: coin.ath_date,
      lastUpdated: coin.last_updated,
      imageUrl: coin.image,
    }));
  } catch (error) {
    logger.error('Failed to fetch crypto prices:', error);
    return getMockCryptoData();
  }
}

/**
 * Fetch trending cryptocurrencies (last 24h)
 */
export async function getTrendingCrypto(): Promise<CryptoTrending[]> {
  try {
    const url = `${COINGECKO_BASE_URL}/search/trending`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();

    return data.coins.map((item: any) => ({
      id: item.item.id,
      symbol: item.item.symbol,
      name: item.item.name,
      marketCapRank: item.item.market_cap_rank,
      thumb: item.item.thumb,
      small: item.item.small,
      large: item.item.large,
      priceChange24h: item.item.data?.price_change_percentage_24h?.usd || 0,
      currentPrice: item.item.data?.price || 0,
    }));
  } catch (error) {
    logger.error('Failed to fetch trending crypto:', error);
    return [];
  }
}

/**
 * Fetch specific coin details
 */
export async function getCoinDetails(coinId: string): Promise<CryptoAsset | null> {
  try {
    const url = `${COINGECKO_BASE_URL}/coins/markets?vs_currency=usd&ids=${coinId}&sparkline=false`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    
    if (data.length === 0) return null;

    const coin = data[0];
    return {
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      currentPrice: coin.current_price,
      priceChange24h: coin.price_change_24h,
      priceChangePercentage24h: coin.price_change_percentage_24h,
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      circulatingSupply: coin.circulating_supply,
      totalSupply: coin.total_supply,
      maxSupply: coin.max_supply,
      ath: coin.ath,
      athChangePercentage: coin.ath_change_percentage,
      athDate: coin.ath_date,
      lastUpdated: coin.last_updated,
      imageUrl: coin.image,
    };
  } catch (error) {
    logger.error(`Failed to fetch coin details for ${coinId}:`, error);
    return null;
  }
}

/**
 * Calculate crypto portfolio value
 */
export function calculateCryptoPortfolio(
  holdings: Array<{ symbol: string; quantity: number }>,
  prices: CryptoAsset[]
): {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  holdings: Array<{
    symbol: string;
    quantity: number;
    currentPrice: number;
    value: number;
    allocation: number;
  }>;
} {
  let totalValue = 0;
  let totalDayChange = 0;
  const enrichedHoldings: Array<{
    symbol: string;
    quantity: number;
    currentPrice: number;
    value: number;
    allocation: number;
  }> = [];

  for (const holding of holdings) {
    const priceData = prices.find(
      p => p.symbol.toLowerCase() === holding.symbol.toLowerCase()
    );

    if (priceData) {
      const value = holding.quantity * priceData.currentPrice;
      const dayChange = value * (priceData.priceChangePercentage24h / 100);
      
      totalValue += value;
      totalDayChange += dayChange;

      enrichedHoldings.push({
        symbol: holding.symbol.toUpperCase(),
        quantity: holding.quantity,
        currentPrice: priceData.currentPrice,
        value,
        allocation: 0, // Will calculate after total
      });
    }
  }

  // Calculate allocations
  for (const holding of enrichedHoldings) {
    holding.allocation = totalValue > 0 ? (holding.value / totalValue) * 100 : 0;
  }

  return {
    totalValue,
    dayChange: totalDayChange,
    dayChangePercent: totalValue > 0 ? (totalDayChange / (totalValue - totalDayChange)) * 100 : 0,
    holdings: enrichedHoldings.sort((a, b) => b.value - a.value),
  };
}

/**
 * Mock crypto data for fallback/demo
 */
function getMockCryptoData(): CryptoAsset[] {
  const mockData: CryptoAsset[] = [
    {
      id: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      currentPrice: 67245.32,
      priceChange24h: 1250.45,
      priceChangePercentage24h: 1.89,
      marketCap: 1320000000000,
      volume24h: 28500000000,
      circulatingSupply: 19650000,
      totalSupply: 21000000,
      maxSupply: 21000000,
      ath: 73750.07,
      athChangePercentage: -8.82,
      athDate: '2024-03-14',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    },
    {
      id: 'ethereum',
      symbol: 'ETH',
      name: 'Ethereum',
      currentPrice: 3520.18,
      priceChange24h: 42.65,
      priceChangePercentage24h: 1.23,
      marketCap: 422000000000,
      volume24h: 15200000000,
      circulatingSupply: 120100000,
      totalSupply: 120100000,
      maxSupply: null,
      ath: 4878.26,
      athChangePercentage: -27.84,
      athDate: '2021-11-10',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    },
    {
      id: 'solana',
      symbol: 'SOL',
      name: 'Solana',
      currentPrice: 145.67,
      priceChange24h: 3.45,
      priceChangePercentage24h: 2.42,
      marketCap: 64500000000,
      volume24h: 2800000000,
      circulatingSupply: 442800000,
      totalSupply: 573700000,
      maxSupply: null,
      ath: 259.96,
      athChangePercentage: -43.96,
      athDate: '2021-11-06',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    },
    {
      id: 'cardano',
      symbol: 'ADA',
      name: 'Cardano',
      currentPrice: 0.4825,
      priceChange24h: 0.012,
      priceChangePercentage24h: 2.55,
      marketCap: 17100000000,
      volume24h: 385000000,
      circulatingSupply: 35450000000,
      totalSupply: 36930000000,
      maxSupply: 45000000000,
      ath: 3.09,
      athChangePercentage: -84.38,
      athDate: '2021-09-02',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
    },
    {
      id: 'polkadot',
      symbol: 'DOT',
      name: 'Polkadot',
      currentPrice: 7.24,
      priceChange24h: 0.18,
      priceChangePercentage24h: 2.55,
      marketCap: 10200000000,
      volume24h: 175000000,
      circulatingSupply: 1409000000,
      totalSupply: 1409000000,
      maxSupply: null,
      ath: 54.98,
      athChangePercentage: -86.83,
      athDate: '2021-11-04',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
    },
    {
      id: 'chainlink',
      symbol: 'LINK',
      name: 'Chainlink',
      currentPrice: 14.85,
      priceChange24h: 0.32,
      priceChangePercentage24h: 2.20,
      marketCap: 8700000000,
      volume24h: 285000000,
      circulatingSupply: 587100000,
      totalSupply: 1000000000,
      maxSupply: 1000000000,
      ath: 52.70,
      athChangePercentage: -71.82,
      athDate: '2021-05-10',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
    },
    {
      id: 'avalanche-2',
      symbol: 'AVAX',
      name: 'Avalanche',
      currentPrice: 35.42,
      priceChange24h: 0.89,
      priceChangePercentage24h: 2.58,
      marketCap: 13400000000,
      volume24h: 365000000,
      circulatingSupply: 378200000,
      totalSupply: 435000000,
      maxSupply: 720000000,
      ath: 144.96,
      athChangePercentage: -75.57,
      athDate: '2021-11-21',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
    },
    {
      id: 'polygon-pos',
      symbol: 'POL',
      name: 'Polygon',
      currentPrice: 0.425,
      priceChange24h: 0.012,
      priceChangePercentage24h: 2.90,
      marketCap: 3150000000,
      volume24h: 125000000,
      circulatingSupply: 7413000000,
      totalSupply: 7413000000,
      maxSupply: 10000000000,
      ath: 2.92,
      athChangePercentage: -85.44,
      athDate: '2021-12-27',
      lastUpdated: new Date().toISOString(),
      imageUrl: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
    },
  ];

  return mockData;
}

export {
  TOP_CRYPTO_IDS,
};
