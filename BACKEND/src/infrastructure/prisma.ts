import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const connectionUrl = env.DATABASE_URL || env.DATABASE_URL_POOLED;

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: connectionUrl,
    },
  },
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});
