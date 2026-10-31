import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { authenticate, requireRoles } from '../auth/rbac.middleware.js';
import { isDelegationRevoked } from '../auth/delegation.service.js';
import {
  SosTriggerSchema,
  SosDispatchSchema,
  SosResolveSchema,
} from './sos.schemas.js';
import {
  triggerSosIncident,
  getActiveSosIncidents,
  acknowledgeSosIncident,
  dispatchReliefBus,
  resolveSosIncident,
} from './sos.service.js';

interface IncidentParams {
  id: string;
}

export async function sosRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/sos/trigger
   * Emergency breakdown trigger initiated by Captain or Bus In-Charge
   * Protected: DRIVER, BUS_INCHARGE, SUPER_ADMIN, DELEGATED_DRIVER
   */
  fastify.post(
    '/trigger',
    { preHandler: [authenticate, requireRoles(Role.DRIVER, Role.BUS_INCHARGE, Role.SUPER_ADMIN, 'DELEGATED_DRIVER')] },
    async (request, reply) => {
      // Hot-path in-memory verification for delegated sessions (<0.1ms)
      if (request.user.role === 'DELEGATED_DRIVER') {
        const isRevoked = await isDelegationRevoked(request.user.jti);
        if (isRevoked) {
          return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Delegated driver session has been revoked or expired',
          });
        }
      }

      const parseResult = SosTriggerSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid SOS trigger payload',
          details: parseResult.error.format(),
        });
      }

      const driverId = request.user.parentDriverId || request.user.userId;

      try {
        const result = await triggerSosIncident(parseResult.data, driverId);

        return reply.code(202).send({
          statusCode: 202,
          message: 'Emergency SOS Broadcast queued in high-priority dispatcher channel',
          incident: result.incident,
          candidateReliefBuses: result.candidateReliefBuses,
        });
      } catch (err: any) {
        fastify.log.error(err, 'Failed to trigger SOS incident');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to record emergency breakdown incident',
        });
      }
    }
  );

  /**
   * GET /api/v1/sos/active
   * Retrieve all currently active or open emergency incidents
   */
  fastify.get(
    '/active',
    { preHandler: [authenticate] },
    async (_request, reply) => {
      try {
        const incidents = await getActiveSosIncidents();
        return reply.code(200).send({
          statusCode: 200,
          incidents,
        });
      } catch (err: any) {
        fastify.log.error(err, 'Failed to fetch active SOS incidents');
        return reply.code(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'Failed to retrieve active incidents',
        });
      }
    }
  );

  /**
   * POST /api/v1/sos/:id/ack
   * Acknowledge an active SOS incident by Admin or Fleet In-Charge
   */
  fastify.post<{ Params: IncidentParams }>(
    '/:id/ack',
    { preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.BUS_INCHARGE)] },
    async (request, reply) => {
      const { id } = request.params;
      const adminId = request.user.userId;

      const updated = await acknowledgeSosIncident(id, adminId);
      if (!updated) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SOS Incident '${id}' not found`,
        });
      }

      return reply.code(200).send({
        statusCode: 200,
        message: 'SOS Incident acknowledged by Fleet Authority',
        incident: updated,
      });
    }
  );

  /**
   * POST /api/v1/sos/:id/dispatch
   * Authorize and assign a relief bus to a disabled breakdown vehicle
   */
  fastify.post<{ Params: IncidentParams }>(
    '/:id/dispatch',
    { preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.BUS_INCHARGE)] },
    async (request, reply) => {
      const { id } = request.params;
      const parseResult = SosDispatchSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid relief bus dispatch payload',
          details: parseResult.error.format(),
        });
      }

      const adminId = request.user.userId;
      const updated = await dispatchReliefBus(id, parseResult.data.reliefBusId, adminId);
      if (!updated) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SOS Incident '${id}' not found`,
        });
      }

      return reply.code(200).send({
        statusCode: 200,
        message: 'Relief bus dispatched successfully',
        incident: updated,
      });
    }
  );

  /**
   * POST /api/v1/sos/:id/resolve
   * Resolve an emergency incident once all passengers are transferred or vehicle is recovered
   */
  fastify.post<{ Params: IncidentParams }>(
    '/:id/resolve',
    { preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN, Role.BUS_INCHARGE, Role.DRIVER)] },
    async (request, reply) => {
      const { id } = request.params;
      const parseResult = SosResolveSchema.safeParse(request.body || {});
      const notes = parseResult.success ? parseResult.data.resolutionNotes : undefined;

      const updated = await resolveSosIncident(id, notes);
      if (!updated) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SOS Incident '${id}' not found`,
        });
      }

      return reply.code(200).send({
        statusCode: 200,
        message: 'SOS Incident resolved successfully',
        incident: updated,
      });
    }
  );
}
