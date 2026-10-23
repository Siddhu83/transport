import { Queue } from 'bullmq';
import { redis } from '../../infrastructure/redis.js';
import { CandidateBus } from './sos.schemas.js';

export const SOS_QUEUE_NAME = 'sos-incident-processing';

export interface SosIncidentJobData {
  incidentId: string;
  busId: string;
  routeId: string;
  driverId: string;
  candidates: CandidateBus[];
  reason: string;
  strandedPassengerBand: string;
  notes?: string | null;
  createdAt: string;
}

export const sosQueue = new Queue<SosIncidentJobData>(SOS_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

/**
 * Enqueues an emergency breakdown incident for asynchronous multi-channel alert dispatch.
 * Keeps Fastify request handler execution under 200ms.
 */
export async function enqueueSosIncident(data: SosIncidentJobData) {
  return await sosQueue.add(`sos-incident-${data.incidentId}`, data, {
    jobId: data.incidentId,
  });
}
