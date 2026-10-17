import type { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { placeholdersAllowed, type DataSource } from '../utils/dataSource';

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  timestamp: Date;
  source: DataSource;
}

export function setupWebSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join room for specific symbols
    socket.on('subscribe', (symbols: string[]) => {
      symbols.forEach((symbol) => {
        socket.join(`symbol:${symbol}`);
        logger.debug(`Client ${socket.id} subscribed to ${symbol}`);
      });
    });

    // Leave room for specific symbols
    socket.on('unsubscribe', (symbols: string[]) => {
      symbols.forEach((symbol) => {
        socket.leave(`symbol:${symbol}`);
        logger.debug(`Client ${socket.id} unsubscribed from ${symbol}`);
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  // Simulated price stream for UI development only. There is no live feed yet, and random
  // prices must never reach production users, so the simulation refuses to start there.
  if (process.env.ENABLE_REALTIME_UPDATES === 'true') {
    if (placeholdersAllowed()) {
      startPriceSimulation(io);
    } else {
      logger.warn('ENABLE_REALTIME_UPDATES is set but no live price feed exists; simulation disabled in production');
    }
  }
}

function startPriceSimulation(io: Server): void {
  const symbols = ['BTC', 'ETH', 'XRP', 'SOL', 'ADA'];
  const basePrices: Record<string, number> = {
    BTC: 97800,
    ETH: 3420,
    XRP: 2.34,
    SOL: 178,
    ADA: 0.78,
  };

  setInterval(() => {
    symbols.forEach((symbol) => {
      const basePrice = basePrices[symbol];
      const change = (Math.random() - 0.5) * 0.02; // ±1% change
      const newPrice = basePrice * (1 + change);

      const update: PriceUpdate = {
        symbol,
        price: newPrice,
        change: change * 100,
        timestamp: new Date(),
        source: 'mock',
      };

      io.to(`symbol:${symbol}`).emit('price_update', update);
    });
  }, 5000); // Update every 5 seconds
}

export function broadcastPortfolioUpdate(
  io: Server,
  userId: string,
  update: unknown
): void {
  io.to(`user:${userId}`).emit('portfolio_update', update);
}

export function broadcastNotification(
  io: Server,
  userId: string,
  notification: unknown
): void {
  io.to(`user:${userId}`).emit('notification', notification);
}
