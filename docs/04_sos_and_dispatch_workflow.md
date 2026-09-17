# 04. SOS Breakdown & Emergency Dispatch Workflow

## 1. Incident Lifecycle State Machine

An emergency dispatch incident transitions through deterministic states to ensure accountability and prevent orphaned events:

```
              ┌───────────────────────┐
              │      [1] OPEN         │ ◀── Driver / In-Charge triggers SOS
              └──────────┬────────────┘
                         │
                         ▼
              ┌───────────────────────┐
              │   [2] DISPATCHED      │ ◀── Admin approves or Auto-Radius assigns
              └──────────┬────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
┌───────────────────────┐         ┌───────────────────────┐
│     [3] RESOLVED      │         │     [4] CANCELLED     │
│ (All passengers safe) │         │   (False alarm/clear) │
└───────────────────────┘         └───────────────────────┘
```

---

## 2. Emergency Trigger Contract (Driver/In-Charge)

### 2.1 Endpoint Specification
- **Method / Path:** `POST /api/v1/sos/trigger`
- **Access Level:** `DRIVER` or `INCHARGE`
- **Validation Schema (Zod):**

```typescript
import { z } from 'zod';

export const SosTriggerSchema = z.object({
  busId: z.string().uuid(),
  routeId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  strandedPassengerBand: z.enum(['BAND_A_UNDER_15', 'BAND_B_15_TO_30', 'BAND_C_30_TO_50', 'BAND_D_OVER_50']),
  reason: z.enum(['MECHANICAL_BREAKDOWN', 'ACCIDENT', 'MEDICAL_EMERGENCY', 'ROAD_BLOCKED', 'OTHER']),
  notes: z.string().max(255).optional(),
});

export type SosTriggerPayload = z.infer<typeof SosTriggerSchema>;
```

---

## 3. Candidate Matching & Proximity Algorithm

When an emergency triggers, Fastify executes an in-memory spatial sweep before enqueuing notification jobs.

```typescript
import { redis } from '../infrastructure/redis';

export interface CandidateBus {
  busId: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  routeId: string;
  speed: number;
}

export async function findCandidateReliefBuses(
  disabledBusId: string,
  longitude: number,
  latitude: number,
  searchRadiusKm: number = 5
): Promise<CandidateBus[]> {
  // 1. Perform sub-millisecond Redis Geospatial Radius Search
  const searchResults = await redis.geosearch(
    'buses:live',
    'FROMLONLAT', longitude, latitude,
    'BYRADIUS', searchRadiusKm, 'KM',
    'WITHDIST',
    'WITHCOORD',
    'ASC' // Closest vehicles first
  );

  const candidates: CandidateBus[] = [];

  for (const item of searchResults) {
    const busId = item[0] as string;
    const distanceKm = parseFloat(item[1] as string);
    const coords = item[2] as [string, string]; // [lng, lat]

    // Skip the disabled bus itself
    if (busId === disabledBusId) continue;

    // 2. Fetch current status & route from ephemeral Redis state hash
    const busState = await redis.hgetall(`bus:${busId}:state`);
    
    // Discard vehicles that have stopped pinging or are already in EMERGENCY status
    if (!busState || busState.status === 'EMERGENCY') continue;

    candidates.push({
      busId,
      distanceKm,
      longitude: parseFloat(coords[0]),
      latitude: parseFloat(coords[1]),
      routeId: busState.routeId,
      speed: parseFloat(busState.speed || '0'),
    });
  }

  return candidates;
}
```

---

## 4. Background Notification Pipeline (BullMQ Queue)

To protect Fastify's event loop from I/O latency, all notifications and external provider calls run asynchronously on a BullMQ queue backed by Redis.

### 4.1 Queue & Job Definition

```typescript
// queues/sosQueue.ts
import { Queue } from 'bullmq';
import { redisConnection } from '../infrastructure/redis';

export const SOS_QUEUE_NAME = 'sos-incident-processing';

export const sosQueue = new Queue(SOS_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
  },
});
```

### 4.2 Worker Processing Implementation

```typescript
// workers/sosWorker.ts
import { Worker, Job } from 'bullmq';
import { SOS_QUEUE_NAME } from '../queues/sosQueue';
import { prisma } from '../infrastructure/prisma';
import { sendPushNotification } from '../services/fcm';
import { sendSMS } from '../services/twilio';

export const sosWorker = new Worker(
  SOS_QUEUE_NAME,
  async (job: Job) => {
    const { incidentId, busId, candidates, reason, strandedPassengerBand } = job.data;

    // 1. High-Priority Push to Admin & Security (Overrides DND toggles)
    await sendPushNotification({
      topic: 'admin-security-alerts',
      title: '🚨 CRITICAL: Bus Breakdown Reported',
      body: `Bus ${busId} has reported ${reason}. Estimated stranded: ${strandedPassengerBand}. ${candidates.length} relief buses nearby.`,
      priority: 'high',
      criticalSound: 1, // APNS & Android Critical Alerts
      data: { incidentId, busId },
    });

    // 2. Alert Candidate Relief Drivers (In-app action request)
    for (const candidate of candidates.slice(0, 3)) { // Top 3 nearest
      await sendPushNotification({
        topic: `driver-alerts-${candidate.busId}`,
        title: '⚠️ Relief Support Request',
        body: `A disabled vehicle is located ${candidate.distanceKm.toFixed(1)} km from your current path. Prepare for route diversion.`,
        priority: 'high',
        data: { incidentId, action: 'CONFIRM_DIVERSION' },
      });
    }

    // 3. Fallback: Critical SMS to Head of Transport
    await sendSMS({
      to: process.env.TRANSPORT_MANAGER_PHONE!,
      body: `[EMERGENCY-SOS] Bus ${busId} down. Incident ID: ${incidentId}. Immediate review required in Admin Console.`,
    });
  },
  { connection: redisConnection }
);
```

---

## 5. Persistence & Audit Trail (PostgreSQL Model)

While live state sits in Redis, all lifecycle changes commit to PostgreSQL via Prisma for post-incident audit and compliance.

### State Transitions on Endpoint Actions

| HTTP Action | Controller Route | DB State | Redis Side-Effect |
| :--- | :--- | :--- | :--- |
| **Trigger SOS** | `POST /api/v1/sos/trigger` | Insert `SosIncident` (status: `OPEN`) | Set `bus:<busId>:state` status \(\to\) `'EMERGENCY'` |
| **Acknowledge** | `POST /api/v1/sos/:id/ack` | Update `SosIncident` (status: `ACKNOWLEDGED`) | Update hash field `ackByAdmin: true` |
| **Authorize Relief** | `POST /api/v1/sos/:id/dispatch` | Update `SosIncident` (`reliefBusId`: `<UUID>`, status: `DISPATCHED`) | Notify assigned relief driver via SSE/Push |
| **Resolve SOS** | `POST /api/v1/sos/:id/resolve` | Update `SosIncident` (status: `RESOLVED`, `resolvedAt`: now()) | Reset `bus:<busId>:state` status \(\to\) `'ACTIVE'` |