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

// In-Memory Fallback Cache when Redis is offline (e.g. CI or unit test runner without Docker)
const memoryStore = new Map<string, { value: any; expiresAt: number }>();

function isRedisReady(): boolean {
  return redis.status === 'ready' || redis.status === 'connect';
}

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

  if (isRedisReady()) {
    try {
      const pipeline = redis.pipeline();
      pipeline.hset(`delegation:ticket:${ticketId}`, ticketData);
      pipeline.expire(`delegation:ticket:${ticketId}`, TICKET_TTL_SECONDS);
      pipeline.set(`delegation:driver_pending:${user.userId}`, ticketId, 'EX', TICKET_TTL_SECONDS);
      await pipeline.exec();
    } catch (err) {
      console.warn('[DelegationService] Redis pipeline failed, falling back to memory store:', err);
      memoryStore.set(`delegation:ticket:${ticketId}`, { value: ticketData, expiresAt });
      memoryStore.set(`delegation:driver_pending:${user.userId}`, { value: ticketId, expiresAt });
    }
  } else {
    memoryStore.set(`delegation:ticket:${ticketId}`, { value: ticketData, expiresAt });
    memoryStore.set(`delegation:driver_pending:${user.userId}`, { value: ticketId, expiresAt });
  }

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
  let rawTicket: Record<string, string> | null = null;

  if (isRedisReady()) {
    try {
      const pipeline = redis.pipeline();
      pipeline.hgetall(ticketKey);
      pipeline.del(ticketKey);
      const results = await pipeline.exec();

      if (results && results[0] && results[0][1]) {
        rawTicket = results[0][1] as Record<string, string>;
      }
    } catch (err) {
      console.warn('[DelegationService] Redis claim failed, falling back to memory store:', err);
    }
  }

  if (!rawTicket) {
    const entry = memoryStore.get(ticketKey);
    if (entry) {
      memoryStore.delete(ticketKey);
      if (Date.now() <= entry.expiresAt) {
        rawTicket = entry.value;
      }
    }
  }

  if (!rawTicket || !rawTicket.ticketId || !rawTicket.busId || !rawTicket.parentDriverId) {
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

  if (isRedisReady()) {
    try {
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
    } catch (err) {
      console.warn('[DelegationService] Redis session save failed, falling back to memory store:', err);
      memoryStore.set(`delegation:session:${jti}`, { value: sessionData, expiresAt: sessionExpiresAt });
      memoryStore.set(`delegation:active_for_driver:${parentDriverId}`, { value: jti, expiresAt: sessionExpiresAt });
      memoryStore.delete(`delegation:driver_pending:${parentDriverId}`);
    }
  } else {
    memoryStore.set(`delegation:session:${jti}`, { value: sessionData, expiresAt: sessionExpiresAt });
    memoryStore.set(`delegation:active_for_driver:${parentDriverId}`, { value: jti, expiresAt: sessionExpiresAt });
    memoryStore.delete(`delegation:driver_pending:${parentDriverId}`);
  }

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
    if (isRedisReady()) {
      try {
        const activeJti = await redis.get(`delegation:active_for_driver:${parentDriverId}`);
        if (activeJti) {
          jti = activeJti;
        }
      } catch {
        // Fallback to memory
      }
    }
    if (!jti) {
      const activeEntry = memoryStore.get(`delegation:active_for_driver:${parentDriverId}`);
      if (activeEntry && Date.now() <= activeEntry.expiresAt) {
        jti = activeEntry.value;
      }
    }
  }

  if (isRedisReady()) {
    try {
      const pipeline = redis.pipeline();
      if (jti) {
        pipeline.set(`delegation:revoked:${jti}`, '1', 'EX', MAX_SESSION_SECONDS);
        pipeline.del(`delegation:session:${jti}`);
      }
      pipeline.del(`delegation:active_for_driver:${parentDriverId}`);
      pipeline.del(`delegation:driver_pending:${parentDriverId}`);
      await pipeline.exec();
    } catch (err) {
      console.warn('[DelegationService] Redis revoke failed, falling back to memory store:', err);
    }
  }

  if (jti) {
    memoryStore.set(`delegation:revoked:${jti}`, { value: '1', expiresAt: Date.now() + MAX_SESSION_SECONDS * 1000 });
    memoryStore.delete(`delegation:session:${jti}`);
  }
  memoryStore.delete(`delegation:active_for_driver:${parentDriverId}`);
  memoryStore.delete(`delegation:driver_pending:${parentDriverId}`);

  return { revoked: true, jti };
}

/**
 * Checks if a delegation session JTI is currently blacklisted (<0.1ms hot path check)
 */
export async function isDelegationRevoked(jti?: string): Promise<boolean> {
  if (!jti) return true;

  if (isRedisReady()) {
    try {
      const exists = await redis.exists(`delegation:revoked:${jti}`);
      return exists === 1;
    } catch {
      // Fallback to memory
    }
  }

  const entry = memoryStore.get(`delegation:revoked:${jti}`);
  return !!entry && Date.now() <= entry.expiresAt;
}

/**
 * Retrieves the currently active delegation or pending ticket for a given driver
 */
export async function getActiveDelegationForDriver(parentDriverId: string): Promise<{
  pendingTicket: Record<string, string> | null;
  activeSession: Record<string, string> | null;
}> {
  let pendingTicket: Record<string, string> | null = null;
  let activeSession: Record<string, string> | null = null;

  if (isRedisReady()) {
    try {
      const pendingTicketId = await redis.get(`delegation:driver_pending:${parentDriverId}`);
      if (pendingTicketId) {
        const data = await redis.hgetall(`delegation:ticket:${pendingTicketId}`);
        if (data && data.ticketId) {
          pendingTicket = data;
        }
      }

      const activeJti = await redis.get(`delegation:active_for_driver:${parentDriverId}`);
      if (activeJti) {
        const data = await redis.hgetall(`delegation:session:${activeJti}`);
        if (data && data.jti) {
          activeSession = data;
        }
      }
      return { pendingTicket, activeSession };
    } catch (err) {
      console.warn('[DelegationService] Redis getActive failed, falling back to memory store:', err);
    }
  }

  // Memory store fallback
  const pendingEntry = memoryStore.get(`delegation:driver_pending:${parentDriverId}`);
  if (pendingEntry && Date.now() <= pendingEntry.expiresAt) {
    const ticketEntry = memoryStore.get(`delegation:ticket:${pendingEntry.value}`);
    if (ticketEntry && Date.now() <= ticketEntry.expiresAt) {
      pendingTicket = ticketEntry.value;
    }
  }

  const activeEntry = memoryStore.get(`delegation:active_for_driver:${parentDriverId}`);
  if (activeEntry && Date.now() <= activeEntry.expiresAt) {
    const sessEntry = memoryStore.get(`delegation:session:${activeEntry.value}`);
    if (sessEntry && Date.now() <= sessEntry.expiresAt) {
      activeSession = sessEntry.value;
    }
  }

  return { pendingTicket, activeSession };
}
