import { FastifyRequest, FastifyReply } from 'fastify';
import { Role } from '@prisma/client';

/**
 * Authentication Hook: Verifies Bearer JWT Token in headers
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or invalid authentication token',
    });
  }
}

/**
 * RBAC Guard Middleware: Ensures user role matches allowed roles matrix
 */
export function requireRoles(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // First ensure request is authenticated
    if (!request.user) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required before role check',
      });
    }

    const userRole = request.user.role;

    if (!allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Role '${userRole}' is not authorized to access this resource`,
        allowedRoles,
      });
    }
  };
}
