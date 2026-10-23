import { Worker, Job } from 'bullmq';
import { redis } from '../../infrastructure/redis.js';
import { SOS_QUEUE_NAME, SosIncidentJobData } from './sos.queue.js';
import { sendPushNotification, sendSMS } from './notifications.service.js';
import { env } from '../../config/env.js';

/**
 * BullMQ Worker: Processes SOS emergency incident notification jobs asynchronously.
 * Offloads multi-channel notifications (Push, SMS, driver alerts) from Fastify request path.
 */
export function createSosWorker(): Worker<SosIncidentJobData> {
  const worker = new Worker<SosIncidentJobData>(
    SOS_QUEUE_NAME,
    async (job: Job<SosIncidentJobData>) => {
      const { incidentId, busId, candidates, reason, strandedPassengerBand, notes } = job.data;
      console.info(`⚡ [SosWorker] Processing emergency alert job ${job.id} for Bus ${busId} (Incident: ${incidentId})`);

      // 1. High-Priority Push to Super Admin & Control Tower (Overrides DND toggles)
      await sendPushNotification({
        topic: 'admin-security-alerts',
        title: '🚨 CRITICAL: Bus Breakdown Reported',
        body: `Bus ${busId} has reported ${reason}. Estimated stranded: ${strandedPassengerBand}. ${candidates.length} relief buses nearby.`,
        priority: 'high',
        criticalSound: 1, // APNS & Android Critical Channel
        data: {
          incidentId,
          busId,
          reason,
          passengerBand: strandedPassengerBand,
          notes: notes || '',
        },
      });

      // 2. Alert Candidate Relief Drivers (Top 3 nearest candidate vehicles)
      for (const candidate of candidates.slice(0, 3)) {
        await sendPushNotification({
          topic: `driver-alerts-${candidate.busId}`,
          title: '⚠️ Relief Support Request',
          body: `A disabled vehicle is located ${candidate.distanceKm.toFixed(1)} km from your current path. Prepare for route diversion.`,
          priority: 'high',
          data: {
            incidentId,
            action: 'CONFIRM_DIVERSION',
            targetBusId: busId,
            distanceKm: String(candidate.distanceKm),
          },
        });
      }

      // 3. Fallback: Immediate SMS to Head of Transport
      const transportPhone = env.TRANSPORT_MANAGER_PHONE || '+15550192834';
      await sendSMS({
        to: transportPhone,
        body: `[EMERGENCY-SOS] Bus ${busId} down. Incident ID: ${incidentId}. Reason: ${reason} (${strandedPassengerBand}). Immediate review required in Admin Console.`,
      });

      return {
        processed: true,
        incidentId,
        alertedCandidatesCount: Math.min(candidates.length, 3),
      };
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.info(`✅ [SosWorker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [SosWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
