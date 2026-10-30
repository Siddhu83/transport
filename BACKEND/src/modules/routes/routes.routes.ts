import { FastifyInstance } from 'fastify';
import { getRouteManifest } from './routes.service.js';
import { prisma } from '../../infrastructure/prisma.js';

interface RouteParams {
  id: string;
}

export async function routeManagementRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/routes
   * Returns a list of active corridors/routes with stop count
   */
  fastify.get('/', async (request, reply) => {
    try {
      const routes = await prisma.route.findMany({
        select: {
          id: true,
          routeNumber: true,
          name: true,
          _count: {
            select: { routeStops: true },
          },
        },
        orderBy: { routeNumber: 'asc' },
      });

      return reply.code(200).send({
        statusCode: 200,
        data: routes.map((r) => ({
          id: r.id,
          routeNumber: r.routeNumber,
          name: r.name,
          totalStops: r._count.routeStops,
        })),
      });
    } catch (err) {
      request.log.warn({ err }, 'Failed to query routes from database');
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database connection currently unavailable',
      });
    }
  });

  /**
   * GET /api/v1/routes/:id/manifest
   * High-speed cached linear route manifest endpoint.
   * Returns ordered stops, distances, geofences, and polyline coordinates.
   */
  fastify.get<{ Params: RouteParams }>('/:id/manifest', async (request, reply) => {
    const { id } = request.params;

    if (!id || id.trim() === '') {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Valid Route ID parameter is required',
      });
    }

    const manifest = await getRouteManifest(id);

    if (!manifest) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Route manifest with id '${id}' was not found`,
      });
    }

    return reply.code(200).send({
      statusCode: 200,
      data: manifest,
    });
  });
}
