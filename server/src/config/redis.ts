import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 3) {
      logger.error('[Redis] Max retries reached');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => {
  logger.info('[Redis] Connected');
});

redis.on('error', (err: Error) => {
  logger.error({ err: err.message }, '[Redis] Error');
});

// Prevent unhandled Redis errors from crashing the process
process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error && reason.message.includes('Redis')) {
    logger.warn({ err: reason.message }, '[Redis] Unhandled rejection suppressed');
    return;
  }
  logger.error({ err: reason }, 'Unhandled rejection');
});
