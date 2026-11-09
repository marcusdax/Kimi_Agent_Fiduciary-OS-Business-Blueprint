import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/users';
import { profileRouter } from './routes/profile';
import { portfolioRouter } from './routes/portfolio';
import { calculationsRouter } from './routes/calculations';
import { toolsRouter } from './routes/tools';
import { financialPlanRouter } from './routes/financial-plan';
import { firmsRouter } from './routes/firms';
import { planningRouter } from './routes/planning';
import { documentsRouter } from './routes/documents';
import { aiRouter } from './routes/ai';
import { aiEnhancedRouter } from './routes/ai-enhanced';
import { marketRouter } from './routes/market';
import { cryptoRouter } from './routes/crypto';
import { logger } from './utils/logger';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';

dotenv.config();
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('A strong environment-specific JWT secret is required');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const httpServer = createServer(app);
// Realtime transport is retired until a validated authenticated feature is configured.

const PORT = process.env.PORT || 3001;
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

// Redacted request diagnostics also cover rejected bodies and rate limits.
app.use(requestLogger);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Compression
app.use(compression());

// Request diagnostics are registered before security/body middleware.

// Health check (no auth required)
app.use('/health', healthRouter);

// API routes
app.use(`${API_PREFIX}/auth`, rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }), authRouter);
app.use(`${API_PREFIX}/financial-plan`, financialPlanRouter);
app.use(`${API_PREFIX}/org`, firmsRouter);
app.use(`${API_PREFIX}/tools`, toolsRouter);
app.use(`${API_PREFIX}/users`, userRouter);
app.use(`${API_PREFIX}/profile`, profileRouter);
app.use(`${API_PREFIX}/portfolio`, portfolioRouter);
app.use(`${API_PREFIX}/calculations`, calculationsRouter);
app.use(`${API_PREFIX}/documents`, documentsRouter);
app.use(`${API_PREFIX}/planning`, planningRouter);
app.use(`${API_PREFIX}/ai`, aiRouter);
app.use(`${API_PREFIX}/ai-v2`, aiEnhancedRouter); // Enhanced AI with Kimi
app.use(`${API_PREFIX}/market`, marketRouter);   // Real-time market data & insurance
app.use(`${API_PREFIX}/crypto`, cryptoRouter);   // Cryptocurrency prices

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// WebSocket setup
// No Socket.IO server is attached; malformed legacy events cannot reach handlers.

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Connect to Redis (optional - continue without Redis if unavailable)
    try {
      await connectRedis();
      logger.info('Redis connected successfully');
    } catch (redisError) {
      logger.warn('Redis not available - continuing without caching');
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Fiduciary OS™ API Server running on port ${PORT}`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/api/v1`);
      logger.info(`💚 Health Check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

startServer();
