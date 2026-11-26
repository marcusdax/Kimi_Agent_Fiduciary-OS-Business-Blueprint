import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redis: Redis | null = null;

export async function connectRedis(): Promise<Redis> {
  if (process.env.REDIS_ENABLED === 'false') throw new Error('Redis explicitly disabled');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Skip Redis when using the default localhost URL outside production (dev, unset NODE_ENV)
  if (!redisUrl || (redisUrl === 'redis://localhost:6379' && process.env.NODE_ENV !== 'production')) {
    throw new Error('Redis disabled outside production');
  }

  redis = new Redis(redisUrl, {
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
  });

  redis.on('connect', () => {
    logger.info('Connected to Redis');
  });

  redis.on('error', (error: Error) => {
    logger.error('Redis error:', error.message);
  });

  return redis;
}

export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized. Call connectRedis() first.');
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Disconnected from Redis');
  }
}

export { redis };
