import { redis } from '../../infrastructure/redis.js';
import { prisma } from '../../infrastructure/prisma.js';
export async function healthRoutes(fastify) {
    // Liveness probe
    fastify.get('/healthz', async () => ({ status: 'alive' }));
    // Readiness probe verifying dependencies
    fastify.get('/readyz', async (_request, reply) => {
        try {
            // 1. Check Redis ping
            const redisPing = await redis.ping();
            if (redisPing !== 'PONG') {
                throw new Error('Redis ping failed');
            }
            // 2. Check Database connection
            await prisma.$queryRaw `SELECT 1`;
            return reply.code(200).send({
                status: 'ready',
                dependencies: { redis: 'healthy', database: 'healthy' },
            });
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            return reply.code(503).send({
                status: 'unhealthy',
                error: errorMessage,
            });
        }
    });
}
