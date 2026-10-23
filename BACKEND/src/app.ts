import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { telemetryRoutes } from './modules/telemetry/telemetry.routes.js';
import { sosRoutes } from './modules/sos/sos.routes.js';
import { routeManagementRoutes } from './modules/routes/routes.routes.js';
import { sseHub } from './modules/telemetry/sseHub.js';

export function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
          },
        }
      : true,
  });

  // Register CORS
  app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register JWT
  app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // Register Health Routes
  app.register(healthRoutes);

  // Register API Modular Routes
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(telemetryRoutes, { prefix: '/api/v1/telemetry' });
  app.register(sosRoutes, { prefix: '/api/v1/sos' });
  app.register(routeManagementRoutes, { prefix: '/api/v1/routes' });

  // Lifecycle Hook: Cleanup background telemetry broadcasters on server close
  app.addHook('onClose', async () => {
    sseHub.close();
  });

  return app;
}
