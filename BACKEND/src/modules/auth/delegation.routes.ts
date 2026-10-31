import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { authenticate, requireRoles } from './rbac.middleware.js';
import {
  CreateDelegationSchema,
  ClaimDelegationSchema,
  RevokeDelegationSchema,
} from './delegation.schemas.js';
import {
  createDelegationTicket,
  claimDelegationTicket,
  revokeDelegation,
  getActiveDelegationForDriver,
} from './delegation.service.js';

export async function delegationRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/auth/delegation/create
   * Primary Driver generates a 15-minute single-use delegation QR ticket
   * Protected: DRIVER, SUPER_ADMIN
   */
  fastify.post(
    '/create',
    { preHandler: [authenticate, requireRoles(Role.DRIVER, Role.SUPER_ADMIN)] },
    async (request, reply) => {
      const parseResult = CreateDelegationSchema.safeParse(request.body || {});
      if (!parseResult.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid delegation payload',
          details: parseResult.error.format(),
        });
      }

      try {
        const ticket = await createDelegationTicket(request.user, parseResult.data);
        return reply.code(201).send({
          statusCode: 201,
          message: 'Delegation QR ticket generated successfully',
          ticket,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Failed to generate delegation ticket';
        return reply.code(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: errMsg,
        });
      }
    }
  );

  /**
   * POST /api/v1/auth/delegation/claim
   * Relief driver / Bus in-charge redeems the QR ticket into a 4-hour JWT
   * Public (No auth required to claim ticket)
   */
  fastify.post('/claim', async (request, reply) => {
    const parseResult = ClaimDelegationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid ticket redemption request',
        details: parseResult.error.format(),
      });
    }

    const result = await claimDelegationTicket(parseResult.data.ticketId, fastify);
    if (!result) {
      return reply.code(410).send({
        statusCode: 410,
        error: 'Gone',
        message: 'Delegation ticket is invalid, expired, or has already been redeemed',
      });
    }

    return reply.code(200).send({
      statusCode: 200,
      message: 'Delegation ticket claimed successfully. 4-hour driver session granted.',
      token: result.token,
      session: result.session,
    });
  });

  /**
   * POST /api/v1/auth/delegation/revoke
   * Immediately terminates active delegation session and blacklists JTI in Redis
   * Protected: DRIVER, SUPER_ADMIN, DELEGATED_DRIVER
   */
  fastify.post(
    '/revoke',
    { preHandler: [authenticate, requireRoles(Role.DRIVER, Role.SUPER_ADMIN, 'DELEGATED_DRIVER')] },
    async (request, reply) => {
      const parseResult = RevokeDelegationSchema.safeParse(request.body || {});
      const targetJti = parseResult.success ? parseResult.data.jti : undefined;

      const parentDriverId =
        request.user.role === 'DELEGATED_DRIVER'
          ? (request.user.parentDriverId || request.user.userId)
          : request.user.userId;

      const jtiToRevoke = targetJti || (request.user.role === 'DELEGATED_DRIVER' ? request.user.jti : undefined);

      const result = await revokeDelegation(parentDriverId, jtiToRevoke);

      return reply.code(200).send({
        statusCode: 200,
        message: 'Delegation session revoked and blacklisted from telemetry ingestion',
        revoked: result.revoked,
      });
    }
  );

  /**
   * GET /api/v1/auth/delegation/active
   * Retrieves active delegation session or pending ticket for the current driver
   * Protected: DRIVER, SUPER_ADMIN
   */
  fastify.get(
    '/active',
    { preHandler: [authenticate, requireRoles(Role.DRIVER, Role.SUPER_ADMIN)] },
    async (request, reply) => {
      const status = await getActiveDelegationForDriver(request.user.userId);
      return reply.code(200).send({
        statusCode: 200,
        ...status,
      });
    }
  );
}
