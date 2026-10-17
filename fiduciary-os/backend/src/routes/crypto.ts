import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  getCryptoPrices,
  getTrendingCrypto,
  getCoinDetails,
  calculateCryptoPortfolio,
  type CryptoAsset,
} from '../services/cryptoService';

const router = Router();

// =============================================================================
// CRYPTOCURRENCY ENDPOINTS - Live Prices
// =============================================================================

// Get all crypto prices
router.get('/prices', authenticateToken, async (req, res, next) => {
  try {
    const prices = await getCryptoPrices();

    res.json({
      success: true,
      data: prices,
      meta: {
        count: prices.length,
        timestamp: new Date().toISOString(),
        source: 'CoinGecko',
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get trending cryptocurrencies
router.get('/trending', authenticateToken, async (req, res, next) => {
  try {
    const trending = await getTrendingCrypto();

    res.json({
      success: true,
      data: trending,
      meta: {
        count: trending.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get specific coin details
router.get('/coin/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const coin = await getCoinDetails(id);

    if (!coin) {
      throw new AppError(404, `Cryptocurrency not found: ${id}`);
    }

    res.json({
      success: true,
      data: coin,
    });
  } catch (error) {
    next(error);
  }
});

// Calculate portfolio value
router.post('/portfolio', authenticateToken, async (req, res, next) => {
  try {
    const { holdings } = req.body;

    if (!Array.isArray(holdings) || holdings.length === 0) {
      throw new AppError(400, 'Holdings array is required');
    }

    // Validate holdings
    for (const holding of holdings) {
      if (!holding.symbol || typeof holding.quantity !== 'number') {
        throw new AppError(400, 'Each holding must have symbol and quantity');
      }
    }

    // Get current prices
    const prices = await getCryptoPrices();

    // Calculate portfolio
    const portfolio = calculateCryptoPortfolio(holdings, prices);

    res.json({
      success: true,
      data: portfolio,
      meta: {
        timestamp: new Date().toISOString(),
        holdingsCount: holdings.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get crypto market summary
router.get('/market-summary', authenticateToken, async (req, res, next) => {
  try {
    const prices = await getCryptoPrices();

    // Calculate market stats
    const totalMarketCap = prices.reduce((sum, p) => sum + p.marketCap, 0);
    const totalVolume = prices.reduce((sum, p) => sum + p.volume24h, 0);
    const avgChange = prices.reduce((sum, p) => sum + (p.priceChangePercentage24h || 0), 0) / prices.length;

    // Top gainers and losers
    const sortedByChange = [...prices].sort((a, b) => 
      (b.priceChangePercentage24h || 0) - (a.priceChangePercentage24h || 0)
    );

    res.json({
      success: true,
      data: {
        totalMarketCap,
        totalVolume24h: totalVolume,
        averageChange24h: avgChange,
        topGainers: sortedByChange.slice(0, 5),
        topLosers: sortedByChange.slice(-5).reverse(),
        btcDominance: prices.find(p => p.symbol === 'BTC')?.marketCap || 0 / totalMarketCap * 100,
        ethDominance: prices.find(p => p.symbol === 'ETH')?.marketCap || 0 / totalMarketCap * 100,
      },
      meta: {
        timestamp: new Date().toISOString(),
        source: 'CoinGecko',
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as cryptoRouter };
