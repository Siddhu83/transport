import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { authenticate, requireRoles } from '../auth/rbac.middleware.js';
import { TelemetryPingSchema, BatchDrainSchema, IngestionStatus } from './telemetry.schemas.js';
import { processTelemetryPing } from './telemetry.service.js';
import { sseHub } from './sseHub.js';

interface StreamQueryParams {
  routeId?: string;
}

export async function telemetryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/telemetry/stream
   * Real-time Server-Sent Events (SSE) telemetry stream broadcaster
   * Query Parameters: ?routeId=<UUID> (Optional route filtering)
   */
  fastify.get<{ Querystring: StreamQueryParams }>('/stream', async (request, reply) => {
    const clientId = randomUUID();
    const routeId = request.query.routeId;
    const res = reply.raw;

    // Set SSE Headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering for sub-second delivery
    });

    // Send initial heartbeat frame to establish pipe
    res.write(': heartbeat\n\n');

    // Register client connection with SSE Hub
    sseHub.addClient({
      id: clientId,
      routeId,
      res,
    });

    // Cleanup client connection on socket close
    request.raw.on('close', () => {
      sseHub.removeClient(clientId);
    });

    // Hi-jack Fastify default reply handling to maintain open HTTP/2 stream
    return reply.hijack();
  });

  /**
   * POST /api/v1/telemetry/ping
   * High-frequency ingestion endpoint for driver GPS telemetry
   * Protected: Required Role = DRIVER
   */
  fastify.post(
    '/ping',
    { preHandler: [authenticate, requireRoles(Role.DRIVER)] },
    async (request, reply) => {
      const parseResult = TelemetryPingSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid telemetry ping payload',
          details: parseResult.error.format(),
        });
      }

      const rawPing = parseResult.data;
      const ping = {
        ...rawPing,
        timestamp: typeof rawPing.timestamp === 'number' ? rawPing.timestamp : new Date(rawPing.timestamp).getTime(),
        routeId: rawPing.routeId || '00000000-0000-0000-0000-000000000000',
        accuracy: rawPing.accuracy ?? 5,
      };

      // Driver Claim Enforcement: Ensure driver only emits for their assigned bus
      if (request.user.assignedBusId && request.user.assignedBusId !== ping.busId) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: `Driver is assigned to bus '${request.user.assignedBusId}' and cannot emit coordinates for bus '${ping.busId}'`,
        });
      }

      const result = await processTelemetryPing(ping);

      switch (result.status) {
        case IngestionStatus.CLOCK_DRIFT_REJECTED:
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: result.message,
          });

        case IngestionStatus.LOW_ACCURACY_DROPPED:
        case IngestionStatus.SPEED_SPIKE_DROPPED:
          return reply.code(204).send();

        case IngestionStatus.SUCCESS:
        default:
          return reply.code(200).send({
            statusCode: 200,
            message: result.message,
            busId: result.busId,
          });
      }
    }
  );

  /**
   * POST /api/v1/telemetry/batch-drain
   * Cellular Dead-Zone Batch Drain Ingestion Endpoint
   * Flushes offline buffered coordinates upon network recovery
   * Applies LERP guard: processes latest ping for live Redis update and broadcasts via SSE
   */
  fastify.post(
    '/batch-drain',
    { preHandler: [authenticate, requireRoles(Role.DRIVER)] },
    async (request, reply) => {
      const parseResult = BatchDrainSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid batch drain payload',
          details: parseResult.error.format(),
        });
      }

      const { pings } = parseResult.data;

      // Sort pings chronologically ascending by timestamp
      const sortedPings = [...pings].sort((a, b) => {
        const timeA = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
        const timeB = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
        return timeA - timeB;
      });

      const latest = sortedPings[sortedPings.length - 1];
      if (!latest) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Empty batch drain array',
        });
      }

      const formattedPing = {
        busId: latest.busId,
        latitude: latest.latitude,
        longitude: latest.longitude,
        speed: latest.speed,
        heading: latest.heading,
        accuracy: latest.accuracy ?? 5,
        timestamp: typeof latest.timestamp === 'number' ? latest.timestamp : new Date(latest.timestamp).getTime(),
        routeId: latest.routeId || '00000000-0000-0000-0000-000000000000',
      };

      const result = await processTelemetryPing(formattedPing);

      return reply.code(200).send({
        statusCode: 200,
        message: `Processed batch of ${pings.length} telemetry pings. Live state updated with latest coordinate.`,
        ingestedCount: pings.length,
        busId: result.busId,
      });
    }
  );
}
