import { Redis } from 'ioredis';
import { env } from '../config/env.js';

const isTest =
  env.NODE_ENV === 'test' ||
  process.env.NODE_ENV === 'test' ||
  process.env.npm_lifecycle_event === 'test' ||
  process.execArgv.includes('--test') ||
  process.argv.includes('--test');

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1, // Fail fast on errors
  enableReadyCheck: false,
  lazyConnect: true, // Don't block process boot
  enableOfflineQueue: false, // ZERO hanging commands when Redis is down: fail immediately to trigger in-memory fallbacks
  retryStrategy(times) {
    if (isTest || times > 2) {
      return null; // Stop reconnecting if Redis is not running
    }
    return Math.min(times * 50, 1000);
  },
});

redis.on('connect', () => {
  console.info('⚡ Connected to Redis');
});

redis.on('error', (err) => {
  if (!isTest) {
    console.error('❌ Redis Connection Error:', err.message);
  }
});
