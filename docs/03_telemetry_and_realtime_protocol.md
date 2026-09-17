# 03. Telemetry & Real-Time Protocol Specification

## 1. Protocol Overview & Network Invariants

The platform uses a split-protocol transport strategy:
1. **Ingestion (Driver \(\to\) Fastify):** HTTP POST (or persistent WebSocket `WSS`) transmitting compact JSON telemetry frames every 3 seconds.
2. **Distribution (Fastify \(\to\) Students/Admins):** Server-Sent Events (SSE) over an HTTP/2 persistent pipe (`text/event-stream`).

```
[Driver Client] ──(HTTP POST/WSS 3s)──▶ [Fastify Ingestion Route]
                                              │
                                              ▼ (Pipeline Write: GEOADD + HSET)
                                     [Redis 7 In-Memory Engine]
                                              │
                                              ▼ (Internal Pub/Sub)
                                     [Fastify SSE Fanout Hub]
                                              │
                                              ▼ (HTTP/2 SSE Event Stream)
                                        [Student / Admin PWAs]
```

### Critical Invariants:
- **No Direct DB Transactions:** Zero database (Postgres/Prisma) calls inside the telemetry ingestion loop.
- **Micro-Batch Fanout:** The SSE broadcaster flushes updates at an interval of **500 ms** to eliminate client rendering bottlenecks while keeping latency well under 1 second.
- **Clock Drift Tolerance:** Reject telemetry payloads with timestamps drifting by more than \(\pm 60\) seconds from host clock to prevent replay attacks.

---

## 2. Ingestion Interface Contract (Driver \(\to\) Backend)

### 2.1 Endpoint Specification
- **Method / Path:** `POST /api/v1/telemetry/ping`
- **Headers:** 
  - `Content-Type: application/json`
  - `Authorization: Bearer <DRIVER_JWT_TOKEN>`

### 2.2 Payload Schema (Zod Validation)

```typescript
import { z } from 'zod';

export const TelemetryPingSchema = z.object({
  busId: z.string().uuid(),
  routeId: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).max(140),          // Speed in km/h
  heading: z.number().min(0).max(359),        // Degrees relative to true north
  altitude: z.number().optional(),            // Meters above sea level
  accuracy: z.number().min(0).max(100),       // GPS radius accuracy in meters
  timestamp: z.number().int().positive(),     // Epoch milliseconds
});

export type TelemetryPing = z.infer<typeof TelemetryPingSchema>;
```

### 2.3 Edge Case & Guard Checks
- **Accuracy Filtering:** If accuracy \(> 35\text{ meters}\) (poor cellular triangulation), discard the coordinate from spatial indexing; return `204 No Content` to prevent marker jitter.
- **Speed Spike Suppression:** If distance calculated from previous location implies speed \(> 140\text{ km/h}\), flag as GPS multipath bounce and drop.

---

## 3. Redis In-Memory Storage & Query Architecture

### 3.1 Key Schema

| Key Pattern | Redis Type | Value / Sub-keys | TTL |
| :--- | :--- | :--- | :--- |
| `buses:live` | Sorted Set (GEO) | Members: `<busId>`, Score: 52-bit Geohash | None (Explicit removal on shift end) |
| `bus:<busId>:state` | Hash | `routeId`, `speed`, `heading`, `status`, `lastSeen` | 30 seconds (Auto-cleared if offline) |
| `route:<routeId>:buses` | Set | Members: `<busId>` | None |

### 3.2 Ingestion Transaction Pipeline (Node.js ioredis)

Every valid incoming ping executes an atomic Redis pipeline:

```typescript
const pipeline = redis.pipeline();

// 1. Update Spatial Geospatial Index
pipeline.geoadd('buses:live', ping.longitude, ping.latitude, ping.busId);

// 2. Update Dynamic Bus Metadata Hash
pipeline.hset(`bus:${ping.busId}:state`, {
  routeId: ping.routeId,
  speed: ping.speed.toString(),
  heading: ping.heading.toString(),
  status: 'ACTIVE',
  lastSeen: ping.timestamp.toString(),
});

// 3. Set short-lived TTL to auto-expire orphaned vehicles
pipeline.expire(`bus:${ping.busId}:state`, 30);

// 4. Publish to internal telemetry message bus
pipeline.publish('telemetry:broadcast', JSON.stringify(ping));

await pipeline.exec();
```

---

## 4. Client Distribution Stream (SSE Protocol)

### 4.1 Endpoint Specification
- **Method / Path:** `GET /api/v1/telemetry/stream`
- **Headers Required:**
  - `Accept: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- **Query Parameters (Optional Filtering):**
  - `?routeId=<UUID>`: Subscribes student client to updates for their specific route.
  - Omitted: Defaults to global canvas view for Admin tower.

### 4.2 SSE Frame Structure
Fastify batches active bus states and writes SSE frames using this schema:

```http
event: fleet-snapshot
id: 1716300405500
data: {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[78.3489,17.4435]},"properties":{"busId":"e5b1...","routeId":"a812...","speed":34.2,"heading":182,"status":"ACTIVE","lastSeen":1716300405450}}]}

: heartbeat
```

### 4.3 Client LERP & Dead Reckoning Algorithm
Student browser interpolates between tick intervals:

```typescript
interface VectorPoint {
  coordinates: [number, number]; // [lng, lat]
  timestamp: number;
}

export function interpolatePosition(
  start: VectorPoint,
  target: VectorPoint,
  currentTime: number,
  durationMs: number = 3000
): [number, number] {
  const elapsed = currentTime - start.timestamp;
  const progress = Math.min(Math.max(elapsed / durationMs, 0), 1);

  // Linear Interpolation (LERP) formula
  const lng = start.coordinates[0] + (target.coordinates[0] - start.coordinates[0]) * progress;
  const lat = start.coordinates[1] + (target.coordinates[1] - start.coordinates[1]) * progress;

  return [lng, lat];
}
```