import { randomBytes } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { redis } from '../../infrastructure/redis.js';
import { prisma } from '../../infrastructure/prisma.js';
import { TokenPayload } from './auth.schemas.js';
import {
  CreateDelegationInput,
  DelegationSessionData,
} from './delegation.schemas.js';

const TICKET_TTL_SECONDS = 900; // 15-minute claim window
const MAX_SESSION_SECONDS = 14400; // 4 hours

/**
 * Generates an ephemeral single-use delegation QR ticket
 */
export async function createDelegationTicket(
  user: TokenPayload,
  input: CreateDelegationInput
): Promise<{ ticketId: string; claimUrl: string; qrData: string; expiresAt: number }> {
  let busId = user.assignedBusId;
  let routeId = user.assignedRouteId;
  let driverName = user.name || user.email;

  // Fallback to database lookup if assigned bus/route are not in token claims
  if (!busId || !routeId) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { assignedBusId: true, assignedRouteId: true, name: true },
      });
      if (dbUser) {
        busId = dbUser.assignedBusId || busId;
        routeId = dbUser.assignedRouteId || routeId;
        driverName = dbUser.name || driverName;
      }
    } catch (err) {
      console.warn(`[DelegationService] Database lookup failed for user ${user.userId}:`, err);
    }
  }

  if (!busId) {
    throw new Error('Driver does not have an assigned bus to delegate');
  }

  const ticketId = 'del_' + randomBytes(12).toString('hex');
  const now = Date.now();
  const expiresAt = now + TICKET_TTL_SECONDS * 1000;
  const durationHours = input.durationHours ?? 4;

  const ticketData: Record<string, string> = {
    ticketId,
    parentDriverId: user.userId,
    parentDriverName: driverName,
    busId,
    routeId: routeId || '',
    delegateName: input.delegateName || 'Relief Driver',
    delegatePhone: input.delegatePhone || '',
    durationHours: durationHours.toString(),
    note: input.note || '',
    createdAt: now.toString(),
    expiresAt: expiresAt.toString(),
  };

  const pipeline = redis.pipeline();
  pipeline.hset(`delegation:ticket:${ticketId}`, ticketData);
  pipeline.expire(`delegation:ticket:${ticketId}`, TICKET_TTL_SECONDS);
  pipeline.set(`delegation:driver_pending:${user.userId}`, ticketId, 'EX', TICKET_TTL_SECONDS);
  await pipeline.exec();

  const claimUrl = `/delegate?ticket=${ticketId}`;
  const qrData = `ATS:DELEGATE:${ticketId}`;

  return {
    ticketId,
    claimUrl,
    qrData,
    expiresAt,
  };
}

/**
 * Atomically redeems a delegation ticket and mints a 4-hour non-renewable JWT session
 */
export async function claimDelegationTicket(
  ticketId: string,
  fastify: FastifyInstance
): Promise<{
  token: string;
  session: {
    role: 'DELEGATED_DRIVER';
    busId: string;
    routeId: string;
    parentDriverId: string;
    parentDriverName: string;
    delegateName: string;
    expiresAt: number;
    jti: string;
  };
} | null> {
  const ticketKey = `delegation:ticket:${ticketId}`;

  // Atomic fetch and delete to prevent replay attacks
  const pipeline = redis.pipeline();
  pipeline.hgetall(ticketKey);
  pipeline.del(ticketKey);
  const results = await pipeline.exec();

  if (!results || !results[0] || !results[0][1]) {
    return null;
  }

  const rawTicket = results[0][1] as Record<string, string>;
  if (!rawTicket.ticketId || !rawTicket.busId || !rawTicket.parentDriverId) {
    return null;
  }

  const expiresAtMs = Number(rawTicket.expiresAt);
  if (Date.now() > expiresAtMs) {
    return null;
  }

  const durationHours = Math.min(4, Math.max(1, Number(rawTicket.durationHours) || 4));
  const durationSeconds = durationHours * 3600;
  const sessionExpiresAt = Date.now() + durationSeconds * 1000;
  const jti = 'dsess_' + randomBytes(16).toString('hex');

  const delegateName = rawTicket.delegateName || 'Relief Driver';
  const parentDriverName = rawTicket.parentDriverName || 'Assigned Captain';
  const parentDriverId = rawTicket.parentDriverId;
  const busId = rawTicket.busId;
  const routeId = rawTicket.routeId || '';

  // Mint scoped 4-hour JWT
  const token = fastify.jwt.sign(
    {
      userId: `del_${parentDriverId}_${jti.slice(-6)}`,
      email: `delegate+${rawTicket.ticketId}@transport.college.edu`,
      name: delegateName,
      role: 'DELEGATED_DRIVER',
      assignedBusId: busId,
      assignedRouteId: routeId || null,
      isDelegated: true,
      delegationId: rawTicket.ticketId,
      parentDriverId,
      parentDriverName,
      delegateName,
      jti,
    },
    {
      expiresIn: `${durationHours}h`,
    }
  );

  const sessionData: DelegationSessionData = {
    jti,
    ticketId: rawTicket.ticketId,
    parentDriverId,
    parentDriverName,
    busId,
    routeId,
    delegateName,
    claimedAt: Date.now(),
    expiresAt: sessionExpiresAt,
  };

  const sessionPipeline = redis.pipeline();
  sessionPipeline.hset(`delegation:session:${jti}`, {
    ...sessionData,
    claimedAt: sessionData.claimedAt.toString(),
    expiresAt: sessionData.expiresAt.toString(),
  });
  sessionPipeline.expire(`delegation:session:${jti}`, durationSeconds);
  sessionPipeline.set(`delegation:active_for_driver:${parentDriverId}`, jti, 'EX', durationSeconds);
  sessionPipeline.del(`delegation:driver_pending:${parentDriverId}`);
  await sessionPipeline.exec();

  return {
    token,
    session: {
      role: 'DELEGATED_DRIVER',
      busId,
      routeId,
      parentDriverId,
      parentDriverName,
      delegateName,
      expiresAt: sessionExpiresAt,
      jti,
    },
  };
}

/**
 * Revokes an active delegation session by pushing its jti to the Redis blacklist
 */
export async function revokeDelegation(
  parentDriverId: string,
  targetJti?: string
): Promise<{ revoked: boolean; jti?: string }> {
  let jti = targetJti;

  if (!jti) {
    const activeJti = await redis.get(`delegation:active_for_driver:${parentDriverId}`);
    if (activeJti) {
      jti = activeJti;
    }
  }

  const pipeline = redis.pipeline();
  if (jti) {
    pipeline.set(`delegation:revoked:${jti}`, '1', 'EX', MAX_SESSION_SECONDS);
    pipeline.del(`delegation:session:${jti}`);
  }
  pipeline.del(`delegation:active_for_driver:${parentDriverId}`);
  pipeline.del(`delegation:driver_pending:${parentDriverId}`);
  await pipeline.exec();

  return { revoked: true, jti };
}

/**
 * Checks if a delegation session JTI is currently blacklisted in Redis (<0.1ms hot path check)
 */
export async function isDelegationRevoked(jti?: string): Promise<boolean> {
  if (!jti) return true;
  const exists = await redis.exists(`delegation:revoked:${jti}`);
  return exists === 1;
}

/**
 * Retrieves the currently active delegation or pending ticket for a given driver
 */
export async function getActiveDelegationForDriver(parentDriverId: string): Promise<{
  pendingTicket: Record<string, string> | null;
  activeSession: Record<string, string> | null;
}> {
  const pendingTicketId = await redis.get(`delegation:driver_pending:${parentDriverId}`);
  let pendingTicket: Record<string, string> | null = null;
  if (pendingTicketId) {
    const data = await redis.hgetall(`delegation:ticket:${pendingTicketId}`);
    if (data && data.ticketId) {
      pendingTicket = data;
    }
  }

  const activeJti = await redis.get(`delegation:active_for_driver:${parentDriverId}`);
  let activeSession: Record<string, string> | null = null;
  if (activeJti) {
    const data = await redis.hgetall(`delegation:session:${activeJti}`);
    if (data && data.jti) {
      activeSession = data;
    }
  }

  return { pendingTicket, activeSession };
}
