# AGENT INSTRUCTIONS: College Transport Management System

You are an expert Systems Architect and Senior Full-Stack Engineer. You are developing a high-throughput, low-latency College Transport Management System for a fleet of 60–100 buses serving 2,000+ concurrent students.

---

## 1. System Invariants & Strict Rules (DO NOT VIOLATE)

1. **Zero Database Writes on Live Coordinates:**
   - NEVER query or write to PostgreSQL/Prisma inside the high-frequency telemetry ingestion loop.
   - Live coordinates MUST route exclusively into memory (**Redis 7** via `GEOADD` and ephemeral hashes).
   - PostgreSQL (Supabase) is strictly reserved for user authentication, static route definitions, bus metadata, and persistent emergency SOS logs.

2. **No Custom DOM Markers on Live Maps:**
   - NEVER create individual HTML DOM markers (`new maplibregl.Marker()`) for live fleet tracking. This causes catastrophic layout thrashing and browser freeze.
   - All dynamic bus icons MUST be rendered using MapLibre GL JS **WebGL Symbol Layers** backed by a single GeoJSON `FeatureCollection` source via `map.getSource('buses').setData(...)`.

3. **No Raw HTTP Polling:**
   - Do NOT implement `setInterval` fetch polling on the client side for coordinates.
   - Real-time coordinates must flow to student clients via **Server-Sent Events (SSE)** or persistent WebSockets (`/api/telemetry/stream`).

4. **Never Block Fastify Event Loop on SOS Dispatch:**
   - Emergency dispatch operations (push notifications, SMS dispatch via Twilio/FCM) MUST NOT block the Fastify request lifecycle.
   - Offload all side effects to a **BullMQ** queue backed by Redis with automatic retry policies. Never rely on raw `setImmediate` or unhandled Promises.

5. **Connection Pooling Rule:**
   - Prisma MUST connect through the Supabase Transaction Pooler (port `6543`) with `connection_limit=10`. Never use direct unpooled connections (port `5432`) in production code.

---

## 2. Core Tech Stack (Approved Versions Only)

- **Runtime & Gateway:** Node.js 22 LTS, Fastify v5
- **ORM & Database:** Prisma v6, PostgreSQL 16 (Supabase) with PostGIS extension
- **In-Memory Geo & Cache:** Redis 7 (commands: `GEOADD`, `GEOSEARCH`, Pub/Sub)
- **Background Jobs:** BullMQ v5
- **Frontend App:** React 19, Vite, Tailwind CSS v4, `mapcn` / shadcn/ui
- **Map Visualization:** MapLibre GL JS v4+ (with client-side linear interpolation / LERP)
- **Mobile Driver Wrapper:** Capacitor v6 with Native Android Foreground Service for background geolocation

---

## 3. Telemetry & Data Model Contracts

### Driver Ingestion Payload (`POST /api/telemetry/ping` or WSS)
```typescript
interface DriverTelemetryPing {
  busId: string;        // UUID
  driverId: string;     // UUID
  routeId: string;      // UUID
  latitude: number;     // WGS84 -90.0 to 90.0
  longitude: number;    // WGS84 -180.0 to 180.0
  speed: number;        // km/h
  heading: number;      // 0 - 359 degrees
  timestamp: number;    // Epoch milliseconds
}
```

### Redis Key Conventions

| Key Pattern | Data Structure | Purpose | TTL |
| :--- | :--- | :--- | :--- |
| `buses:live` | Sorted Set (GEO) | `GEOADD buses:live <lng> <lat> <busId>` | Permanent (Updated per ping) |
| `bus:<busId>:state` | Hash | Stores speed, heading, routeId, lastSeen timestamp | 30 seconds (Auto-expires if bus goes offline) |
| `sos:active:<incidentId>` | Hash | Stores snapshot of disabled bus and incident status | None (Explicitly cleared on resolution) |

### Proximity SOS Query Contract (Radius Matching)
When an SOS triggers, query nearby candidate vehicles via:

```typescript
// Radius query: 5km around the breakdown coordinate
await redis.geosearch(
  'buses:live',
  'FROMLONLAT', longitude, latitude,
  'BYRADIUS', 5, 'KM',
  'WITHDIST',
  'WITHCOORD'
);
```

---

## 4. Frontend Map Rendering Pattern (MapLibre WebGL)

Always implement live marker updates through vector source updates:

```typescript
// Correct implementation:
const updateBusSource = (map: maplibregl.Map, buses: GeoJSON.FeatureCollection) => {
  const source = map.getSource('buses') as maplibregl.GeoJSONSource;
  if (source) {
    source.setData(buses);
  }
};

// Smooth movement must use requestAnimationFrame linear interpolation (LERP):
const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};
```

---

## 5. Coding Standards & Behavioral Expectations

- **Explicit TypeScript Types:** Do NOT use `any`. Every function argument, return type, API payload, and state variable must be strictly typed.
- **Fail Fast with Zod Validation:** All incoming HTTP and WebSocket payloads must be validated using Zod or Fastify's native JSON Schema validation before reaching business logic.
- **Graceful Degradation:** If Redis is momentarily unavailable, fallback cleanly or reject with a `503 Service Unavailable` response. Do not dump stack traces or crash the Node process.
- **No Premature Complexity:** Avoid microservices, Kafka, GraphQL, or multi-tenant abstraction layers. Keep all code in a clean, modular monolith structure (`src/modules/{telemetry, sos, routes, auth}`).