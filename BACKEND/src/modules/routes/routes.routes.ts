import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { getRouteManifest, saveIngestedRoute } from './routes.service.js';
import { CreateStudioRouteSchema, ImportFileRouteSchema } from './routes.schemas.js';
import { parseRouteFile } from '../../services/routeParser.js';
import { authenticate, requireRoles } from '../auth/rbac.middleware.js';
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

  /**
   * POST /api/v1/routes/studio
   * Ingests interactive visual studio routes with automated OSRM road snapping
   * Protected: SUPER_ADMIN (unrestricted), BUS_INCHARGE & DRIVER (scoped to assigned bus)
   */
  fastify.post(
    '/studio',
    { preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.BUS_INCHARGE, Role.DRIVER)] },
    async (request, reply) => {
      const parseResult = CreateStudioRouteSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid route studio payload',
          details: parseResult.error.format(),
        });
      }

      const input = parseResult.data;
      let effectiveBusId = input.busId;

      // Scoped RBAC: Drivers and Incharges can only configure their assigned vehicle
      if (request.user.role !== Role.SUPER_ADMIN) {
        const assigned = request.user.assignedBusId;
        if (!assigned) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You must have an assigned bus to configure routes',
          });
        }
        if (effectiveBusId && effectiveBusId !== assigned) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You can only configure routes for your assigned vehicle',
          });
        }
        effectiveBusId = assigned;
      }

      try {
        const manifest = await saveIngestedRoute({
          routeNumber: input.routeNumber,
          name: input.name,
          busId: effectiveBusId,
          stops: input.stops,
          polylineCoordinates: input.polylineCoordinates,
        });

        return reply.code(201).send({
          statusCode: 201,
          message: `Route '${input.routeNumber}' successfully ingested and published`,
          data: manifest,
        });
      } catch (err: unknown) {
        request.log.error({ err }, 'Failed to ingest studio route');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to save route',
        });
      }
    }
  );

  /**
   * POST /api/v1/routes/import-file
   * 1-Click ingestion for Google My Maps KML and standard GPX tracks
   * Protected: SUPER_ADMIN (unrestricted), BUS_INCHARGE & DRIVER (scoped to assigned bus)
   */
  fastify.post(
    '/import-file',
    { preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.BUS_INCHARGE, Role.DRIVER)] },
    async (request, reply) => {
      const parseResult = ImportFileRouteSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid file import payload',
          details: parseResult.error.format(),
        });
      }

      const input = parseResult.data;
      let effectiveBusId = input.busId;

      // Scoped RBAC
      if (request.user.role !== Role.SUPER_ADMIN) {
        const assigned = request.user.assignedBusId;
        if (!assigned) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You must have an assigned bus to configure routes',
          });
        }
        if (effectiveBusId && effectiveBusId !== assigned) {
          return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'You can only configure routes for your assigned vehicle',
          });
        }
        effectiveBusId = assigned;
      }

      // Parse KML or GPX geometry
      const extracted = parseRouteFile(input.fileContent, input.fileType);

      if (extracted.stops.length < 2) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `File must contain at least 2 stops/waypoints (extracted ${extracted.stops.length})`,
        });
      }

      const routeName = input.name || extracted.routeName || 'Imported Corridor';
      const routeNumber = input.routeNumber || `R-${Math.floor(100 + Math.random() * 900)}`;

      try {
        const manifest = await saveIngestedRoute({
          routeNumber,
          name: routeName,
          busId: effectiveBusId,
          stops: extracted.stops,
          polylineCoordinates: extracted.polylineCoordinates,
        });

        return reply.code(201).send({
          statusCode: 201,
          message: `Corridor '${routeNumber}' imported with ${manifest.stops.length} stops and ${manifest.totalDistanceKm}km`,
          data: manifest,
        });
      } catch (err: unknown) {
        request.log.error({ err }, 'Failed to import route file');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : 'Failed to import route file',
        });
      }
    }
  );
}
