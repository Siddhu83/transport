import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { QueueEvents } from 'bullmq';
import { sosQueue, enqueueSosIncident, SOS_QUEUE_NAME } from '../sos.queue.js';
import { createSosWorker } from '../sos.worker.js';
import { notificationAuditLogs } from '../notifications.service.js';
import { CandidateBus } from '../sos.schemas.js';
import { redis } from '../../../infrastructure/redis.js';

describe('Sprint 11: Asynchronous BullMQ Queue & Multi-Channel Alert Pipeline', () => {
  let worker: ReturnType<typeof createSosWorker>;
  let queueEvents: QueueEvents;

  before(async () => {
    // Start BullMQ worker & events listener
    worker = createSosWorker();
    queueEvents = new QueueEvents(SOS_QUEUE_NAME, { connection: redis });
    await worker.waitUntilReady();
    await queueEvents.waitUntilReady();
  });

  after(async () => {
    // Graceful teardown to prevent hanging event loop handles
    await queueEvents.close();
    await worker.close();
    await sosQueue.close();
    redis.disconnect();
  });

  test('BullMQ queue is initialized with 3 retry attempts and exponential backoff', () => {
    assert.equal(sosQueue.name, SOS_QUEUE_NAME);
    assert.equal(sosQueue.defaultJobOptions.attempts, 3);
    assert.deepEqual(sosQueue.defaultJobOptions.backoff, {
      type: 'exponential',
      delay: 2000,
    });
  });

  test('Worker processes emergency job and dispatches Push & SMS alerts to security and relief drivers', async () => {
    const testIncidentId = randomUUID();
    const testBusId = 'BUS-101';
    const candidateBusId = randomUUID();

    const candidates: CandidateBus[] = [
      {
        busId: candidateBusId,
        distanceKm: 1.4,
        latitude: 17.894,
        longitude: 83.391,
        routeId: randomUUID(),
        speed: 35,
        busNumber: 'BUS-105',
      },
    ];

    const initialLogCount = notificationAuditLogs.length;

    // Enqueue job via helper
    const job = await enqueueSosIncident({
      incidentId: testIncidentId,
      busId: testBusId,
      routeId: randomUUID(),
      driverId: randomUUID(),
      candidates,
      reason: 'MECHANICAL_BREAKDOWN',
      strandedPassengerBand: 'BAND_B_15_TO_30',
      notes: 'Transmission fluid leak near Highway junction',
      createdAt: new Date().toISOString(),
    });

    assert.ok(job.id, 'Job should receive a valid BullMQ identifier');

    // Wait for worker to finish processing the job
    const result = await job.waitUntilFinished(queueEvents);
    assert.equal(result.processed, true);
    assert.equal(result.incidentId, testIncidentId);
    assert.equal(result.alertedCandidatesCount, 1);

    // Verify Audit Logs
    const recentLogs = notificationAuditLogs.slice(initialLogCount);

    // 1. Admin & Security Push
    const adminPush = recentLogs.find(
      (l) => l.type === 'PUSH' && l.recipient === 'admin-security-alerts'
    );
    assert.ok(adminPush, 'Admin security push must be dispatched');
    assert.equal(adminPush.payload.criticalSound, 1, 'Push must have critical sound flag set to 1');
    assert.ok(adminPush.payload.body.includes(testBusId));

    // 2. Candidate Driver Push
    const driverPush = recentLogs.find(
      (l) => l.type === 'PUSH' && l.recipient === `driver-alerts-${candidateBusId}`
    );
    assert.ok(driverPush, 'Nearby candidate relief driver push must be dispatched');
    assert.equal(driverPush.payload.data.action, 'CONFIRM_DIVERSION');

    // 3. Fallback SMS to Transport Manager
    const managerSms = recentLogs.find((l) => l.type === 'SMS');
    assert.ok(managerSms, 'Fallback SMS to transport manager must be dispatched');
    assert.ok(managerSms.payload.body.includes(testIncidentId));
  });
});
