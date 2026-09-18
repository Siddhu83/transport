import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { healthRoutes } from './modules/health/health.routes.js';
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
        disableRequestLogging: false,
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
    return app;
}
