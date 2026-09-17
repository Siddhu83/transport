# 02. System Architecture & Topology

## 1. High-Level Architectural Pattern

The platform implements a **Decoupled Dual-Plane Architecture**:
1. **The Telemetry Plane (Hot / Ephemeral):** Operates entirely in memory (Fastify \(\to\) Redis 7 \(\to\) SSE Fanout). Never touches the disk or executes SQL statements during transit.
2. **The Control & Persistence Plane (Cold / Transactional):** Operates through an ORM (Fastify \(\to\) Prisma \(\to\) Supabase PostgreSQL). Handles auth, routing graphs, schedules, and incident audits.

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                     CLIENT APPLICATIONS                  │
                 │  [Driver Native App]      [Student PWA]   [Admin Portal] │
                 └──────────┬──────────────────────▲───────────────▲────────┘
                            │ (WSS / HTTPS POST)   │               │
                            │                      │ (HTTP/2 SSE)  │ (HTTP/2 SSE)
                            ▼                      │               │
                 ┌─────────────────────────────────┴───────────────┴────────┐
                 │              NGINX REVERSE PROXY & SSL TERMINATION       │
                 └──────────────────────────┬───────────────────────────────┘
                                            │
                                            ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │            FASTIFY COMPUTING ENGINE (Node.js 22)         │
                 │  ├── Auth & RBAC Interceptors (JWT Validation)           │
                 │  ├── Telemetry Ingestion Controller                      │
                 │  ├── SSE Connection Manager (Global Canvas Fanout)       │
                 │  └── SOS Incident Coordinator                            │
                 └───┬───────────────────────────────┬──────────────────┬───┘
                     │                               │                  │
     (In-Memory Pings│             (Async SOS Events)│                  │(Prisma Queries)
      & Geo Searches)│                               │                  │
                     ▼                               ▼                  ▼
          ┌─────────────────────┐       ┌───────────────────────┐  ┌──────────────────┐
          │   REDIS 7 CLUSTER   │       │     BULLMQ WORKER     │  │    SUPABASE      │
          │  ├── buses:live     │◀──────┤  ├── FCM Push Worker  │  │  (POSTGRESQL 16) │
          │  │   (GEO Set)      │       │  └── SMS Queue Worker │  │  ├── Core Tables │
          │  └── bus:<id>:state │       └───────────┬───────────┘  │  └── PostGIS     │
          │      (Hashes)       │                   │              └──────────────────┘
          └─────────────────────┘                   ▼
                                            [ Firebase & Twilio ]
```

---

## 2. Telemetry Processing Pipeline (The Hot Path)

```
[Driver Device]
│
│ 1. Telemetry Ping every 3s: { busId, lat, lng, speed, heading, timestamp }
▼
[Fastify Ingestion Route: POST /api/telemetry/ping]
│
│ 2. Validate JWT Driver Claims (In-memory verification)
│ 3. Execute Pipeline to Redis:
│    - GEOADD buses:live <lng> <lat> <busId>
│    - HSET bus:<busId>:state speed heading routeId lastSeen
│    - EXPIRE bus:<busId>:state 30
▼
[Redis 7 (In-Memory)]
│
│ 4. Publish to internal channel: PUBLISH fleet:telemetry:update
▼
[Fastify SSE Hub (Connection Manager)]
│
│ 5. Fan out compact GeoJSON FeatureCollection to connected clients
▼
[Student / Admin Browsers (MapLibre GL JS)]
│
│ 6. Source update: map.getSource('buses').setData(featureCollection)
▼
[Client GPU (WebGL)] ──▶ 60 FPS smooth marker transition via LERP
```

### Key Architectural Invariants:
- Fastify batches SSE outgoing updates on a **500ms debounce throttle window**. Instead of blasting clients with 60 distinct network frames per second, updates are accumulated and flushed as a clean array snapshot twice per second.
- PostgreSQL connections are **0 per second** on this path.

---

## 3. Emergency SOS & Nearby Fleet Dispatch Engine

```
[Driver / In-Charge Device]
│
│ 1. POST /api/sos/trigger { busId, routeId, capacityNeeded, reason }
▼
[Fastify SOS Controller]
│
├────▶ 2. Write Transaction to Supabase via Prisma:
│         SosIncident created with state OPEN (Returns incidentId)
│
├────▶ 3. Query Redis for candidates:
│         GEOSEARCH buses:live FROMLONLAT <lng> <lat> BYRADIUS 5 KM WITHDIST
│
├────▶ 4. Filter Candidate Buses:
│         Read bus:<busId>:state hashes for all nearby IDs.
│         Filter out disabled bus and buses with insufficient available seats.
│
└────▶ 5. Push Background Task to BullMQ Queue:
          - Target: 'notifications'
          - Payload: { incidentId, candidateBuses, disabledBusId }
          - Return HTTP 202 Accepted to Driver (sub-200ms round-trip)
```

### BullMQ Background Worker Responsibilities:
1. Trigger Apple Push Notification Service (APNS) & Firebase Cloud Messaging (FCM) using the **`critical: 1` sound channel** to alert Campus Security and Transport Administrators.
2. Push live alert status to the SSE Fanout stream to render a red perimeter ring around the affected vehicle on all student maps.
3. If no acknowledgement is received within 180 seconds, dispatch fallback SMS messages to designated standby drivers via Twilio/Vonage.

---

## 4. Storage Architecture & Partitioning

### 4.1 Redis 7 (Transient Cache & Spatial State)
- **`buses:live` (Sorted Set / Geohash):** Stores the latest 2D spatial coordinate of every active bus. Sub-millisecond geographic radius slicing via `GEOSEARCH`.
- **`bus:<busId>:state` (Hash):** Stores telemetry scalars (`routeId`, `speed`, `heading`, `lastSeenEpoch`). Key has a strict **30-second TTL** to ensure disconnected buses automatically drop off the active tracking canvas.
- **`sos:active:<incidentId>` (Hash):** Ephemeral tracking of in-progress rescue operations.

### 4.2 Supabase PostgreSQL 16 (Durable Data Store)
- Connects exclusively via **Supabase PgBouncer Transaction Pooler** (Port `6543`).
- Direct connection pool size capped at 10 to ensure zero pool exhaustion under multi-worker scaling.
- Uses PostGIS spatial geometries (`GEOMETRY(LineString, 4326)` and `GEOMETRY(Point, 4326)`) strictly for static route polylines and physical stop definitions.

---

## 5. Network & Deployment Topology

```
              Internet (Cellular 4G / 5G / Broadband)
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │   Cloudflare Edge Network   │
                 │  - Full TLS 1.3 Termination │
                 │  - HTTP/2 & DDoS Shield     │
                 └──────────────┬──────────────┘
                                │
                     (Outbound Secure Tunnel)
                                ▼
    ┌────────────────────────────────────────────────────────┐
    │     HOST ENVIRONMENT (Single VPS or On-Premises Host)  │
    │                                                        │
    │   [Docker: Nginx Reverse Proxy]                        │
    │         │ (Port 8000 Proxy Pass)                       │
    │         ▼                                              │
    │   [Docker: Fastify API Gateway (Node.js 22)]           │
    │         ├── Direct In-Memory Read/Write                │
    │         │       ▼                                      │
    │         │  [Docker: Redis 7 Engine]                    │
    │         │                                              │
    │         ├── Async Worker Stream                        │
    │         │       ▼                                      │
    │         │  [Docker: BullMQ Worker Process]             │
    │         │                                              │
    │         └── Secure Connection (Port 6543)              │
    │                 ▼                                      │
    └─────────────────┼──────────────────────────────────────┘
                      │ (Encrypted TLS Egress)
                      ▼
          [Supabase Managed PostgreSQL DB]
```