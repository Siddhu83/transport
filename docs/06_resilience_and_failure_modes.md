# 06. Resilience, Failure Modes & Disaster Recovery

## 1. Resilience Philosophy & Architectural Thresholds

The system is designed with a **fail-safe, degraded-mode-first** posture. If any single dependency fails (cellular connectivity, external third-party push APIs, or Redis temporary drops), the platform must continue operating in a deterministic, degraded state without crashing processes or blocking critical emergency actions.

---

## 2. Mobile OS Survival Matrix (Driver Android Background Telemetry)

Mobile operating systems enforce aggressive power management (Android Doze Mode, App Standby Buckets). Standard web workers and unprivileged mobile apps are suspended within 60 to 180 seconds of screen lock.

```
[ Driver Locks Screen / Takes Phone Call ]
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│ ANDROID OS POWER SUBSYSTEM                             │
│   - Checks active foreground services                  │
│   - Checks battery optimization whitelist             │
│   - Enforces location throttling                       │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼ (Privileged Execution Granted)
┌────────────────────────────────────────────────────────┐
│ CAPACITOR NATIVE ANDROID RUNTIME                       │
│   ├── Android 14+ Foreground Service ('location')      │
│   ├── Persistent Non-Dismissible Notification Channel  │
│   └── High-Accuracy GPS Sensor Polling (FusedLocation) │
└────────────────────────────────────────────────────────┘
```

### 2.1 Android Manifest & Permissions Contract
The native Capacitor Android container (`android/app/src/main/AndroidManifest.xml`) must include these precise permissions and service declarations:

```xml
<!-- Hardware & Geolocation Permissions -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Foreground Execution Privileges -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Power Optimization Bypass -->
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

<application ...>
    <!-- Foreground Service Declaration for Android 14+ Compliance -->
    <service
        android:name="com.transitsystem.driver.TrackingService"
        android:enabled="true"
        android:exported="false"
        android:foregroundServiceType="location" />
</application>
```

### 2.2 Battery Optimization Bypass Flow
On first launch, the driver client must check if the app is whitelisted from battery restrictions. If not, trigger an intent directly to system settings:

```typescript
// src/services/batteryOptimization.ts
import { App } from '@capacitor/app';

export async function requestBatteryExemption() {
  if (window.Capacitor?.getPlatform() === 'android') {
    const isIgnoring = await checkBatteryOptimizations();
    if (!isIgnoring) {
      // Trigger Intent to open Battery Optimization Exemption dialog
      await window.Capacitor.Plugins.NativeSettings.open({
        optionAndroid: 'request-ignore-battery-optimizations',
      });
    }
  }
}
```

### 2.3 Android Notification Channel Specifications
To prevent the OS from killing the foreground tracking daemon, the notification must have the following configuration:
- **Channel ID:** `transit_driver_tracking_channel`
- **Importance:** `IMPORTANCE_LOW` (emits no disruptive alert sounds while driving)
- **Flag:** `FLAG_NO_CLEAR` and `FLAG_ONGOING_EVENT` (user cannot swipe the notification away)
- **Title:** `"Fleet Tracking Active"`
- **Content:** `"Transmitting route telemetry to campus control tower."`

---

## 3. Cellular Dead-Zone Buffering & Reconnection Protocol

When buses travel through geographic dead spots, underpasses, or areas with low cellular reception, network requests will timeout (`ECONNABORTED`, `ETIMEDOUT`).

```
[ GPS Sensor ] ──▶ [ Network Status Check ]
                          │
         ┌────────────────┴────────────────┐
         ▼ (Online)                        ▼ (Offline / Dead Zone)
  [ POST to Fastify ]             [ Enqueue into Local FIFO Ring Buffer ]
                                           │
                                           ▼ (Max 20 Pings Stored)
                                  [ Connection Restored ]
                                           │
                                           ▼
                                  [ Drain Buffer with Batch Flush ]
```

### 3.1 Driver-Side In-Memory Ring Buffer
To prevent memory leaks on the driver's phone during long disconnects, implement a fixed-capacity ring buffer capped at 20 coordinates (~60 seconds of history):

```typescript
// src/services/telemetryBuffer.ts
import { TelemetryPing } from '@shared/types/telemetry';

export class TelemetryBuffer {
  private buffer: TelemetryPing[] = [];
  private readonly MAX_BUFFER_SIZE = 20;

  public enqueue(ping: TelemetryPing): void {
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      // Evict oldest coordinate (FIFO) to avoid stale payload bloat
      this.buffer.shift();
    }
    this.buffer.push(ping);
  }

  public drain(): TelemetryPing[] {
    const records = [...this.buffer];
    this.buffer = [];
    return records;
  }

  public isEmpty(): boolean {
    return this.buffer.length === 0;
  }
}
```

### 3.2 Recovery Flush & Spike Mitigation
When cellular connectivity returns:
- **Batch Transmission:** The client transmits the buffered array via `POST /api/v1/telemetry/batch-drain`.
- **Server-Side LERP Guard:** The backend extracts only the latest valid timestamp for live spatial indexing in Redis (`GEOADD buses:live`).
- **Audit Preservation:** Older buffered points are written only to audit logs and are not broadcast across the active SSE canvas to avoid rubber-banding and false speed alerts.

---

## 4. Database & Cache Circuit Breakers

To protect the platform against cascading failures when Supabase (Postgres) or Redis experiences intermittent high load or network splits, the API Gateway runs circuit breakers.

```
Incoming Request
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ FASTIFY CIRCUIT BREAKER                                │
│   State: [ CLOSED (Normal) ]                           │
│   ├── If Failure Rate > 50% within 10s Window          │
│   └── Shift State to: [ OPEN (Reject immediately) ]    │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ├──▶ [ OPEN ]: Returns HTTP 503 (Fallback / Read Replica)
                   │
                   └──▶ [ HALF-OPEN ]: Sends Canary Request after 15s Cooldown
```

### 4.1 Redis Outage Handling Strategy
If Redis restarts or becomes unreachable:
- **Telemetry Ingestion:** Fastify rejects incoming telemetry pings with `HTTP 503 Service Unavailable` with `Retry-After: 5`. The driver client diverts points into its local ring buffer.
- **Read Canvas:** Fastify serves the last cached in-memory snapshot to connected SSE clients. Markers transition to a muted gray with an alert pill: `"Network Reconnecting - Stale Coordinates"`.
- **No Spill to PostgreSQL:** Under no circumstances should telemetry pings failover to write directly into Supabase PostgreSQL, as this would cause immediate pool exhaustion and take down the entire system.

### 4.2 Supabase PostgreSQL Pool Exhaustion Safeguards
- **Pooler Configuration:** All application code connects via Supavisor (Port `6543`) with `connection_limit=10`.
- **Query Timeout Enforcement:** All Prisma operations enforce a hard 5,000ms query timeout.

```typescript
// src/infrastructure/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_POOLED, // Ensure port 6543
    },
  },
  log: ['warn', 'error'],
});

// Enforce statement timeout middleware
prisma.$use(async (params, next) => {
  const timeoutMs = 5000;
  return Promise.race([
    next(params),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Database operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
});
```

---

## 5. Health Probes & Disaster Triage Matrix

### 5.1 Service Health Probes
Fastify must expose two dedicated, unauthenticated infrastructure health endpoints:
- **Liveness Probe (`GET /healthz`):** Returns `HTTP 200 { status: "alive" }` if the Node.js event loop is responsive. Used by process orchestrators (Docker / PM2) to trigger process restarts if the event loop freezes.
- **Readiness Probe (`GET /readyz`):** Verifies active connections to both Redis and Supabase.

```typescript
// src/modules/health/health.routes.ts
import { FastifyInstance } from 'fastify';
import { redis } from '../../infrastructure/redis';
import { prisma } from '../../infrastructure/prisma';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/healthz', async () => ({ status: 'alive' }));

  fastify.get('/readyz', async (request, reply) => {
    try {
      // 1. Check Redis ping
      const redisPing = await redis.ping();
      if (redisPing !== 'PONG') throw new Error('Redis ping failed');

      // 2. Check Database transaction pool
      await prisma.$queryRaw`SELECT 1`;

      return reply.code(200).send({
        status: 'ready',
        dependencies: { redis: 'healthy', database: 'healthy' },
      });
    } catch (err: any) {
      return reply.code(503).send({
        status: 'unhealthy',
        error: err.message,
      });
    }
  });
}
```

### 5.2 Failure Triage Playbook

| Symptom / Alert | Root Cause | Immediate Automated Action | Manual Triage Procedure |
| :--- | :--- | :--- | :--- |
| **All bus markers freeze across campus.** | Redis process down or memory limit reached. | Fastify halts SSE broadcasts; sends `event: stale-warning` to clients. | Restart Redis container; check `maxmemory` eviction policy in `redis.conf`. |
| **SOS alerts not delivering SMS/Push.** | BullMQ queue blocked or Twilio rate-limited. | BullMQ retries 3 times with exponential backoff; pushes to Dead Letter Queue (DLQ). | Inspect Redis `sos-incident-processing:failed` keys; execute fallback manual broadcast. |
| **High latency (\(> 2\text{s}\)) on Driver pings.** | Node.js event-loop blocked by synchronous tasks. | Fastify threshold alarms emit warnings. | Ensure no JSON parsing of unbounded files; verify Zod payloads are constrained. |
| **Supabase throws remaining connection slots reserved.** | Unpooled connections hitting direct port 5432. | Circuit breaker trips; rejects new auth requests with `503`. | Verify `DATABASE_URL` is set to port 6543 (transaction pooler) across all environment files. |