import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true, // Don't crash process immediately if Redis is unreachable on boot
  retryStrategy(times) {
    // In test environment, limit retries to 3 attempts to prevent hanging process
    if (env.NODE_ENV === 'test' && times > 3) {
      return null; // Stop reconnecting if Redis is not running
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.info('⚡ Connected to Redis');
});

redis.on('error', (err) => {
  if (env.NODE_ENV !== 'test') {
    console.error('❌ Redis Connection Error:', err.message);
  }
});
