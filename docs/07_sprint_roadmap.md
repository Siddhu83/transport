# 07. 17-Sprint Engineering Roadmap & Master Execution Plan

## 1. Executive Summary & Delivery Strategy

This document details the **17-Sprint (34-Week)** master engineering roadmap for developing, testing, and deploying the College Transport Management System. The roadmap is structured around the **Decoupled Dual-Plane Architecture** defined in [02. System Architecture & Topology](https://github.com/Siddhu83/transport/docs/02_system_architecture.md), ensuring strict isolation between the **High-Frequency Ingestion Hot Path** (Fastify + Redis 7 + SSE) and the **Transactional Persistence Cold Path** (Prisma + Supabase PostgreSQL).

### Delivery Velocity & Milestones:
- **Phase 1 (Sprints 1–3):** Foundation, Infrastructure & Telemetry Ingestion Engine
- **Phase 2 (Sprints 4–6):** SSE Real-Time Streaming & WebGL Map Rendering
- **Phase 3 (Sprints 7–9):** Native Driver Android Kiosk & Cellular Dead-Zone Resilience
- **Phase 4 (Sprints 10–12):** SOS Breakdown Proximity Matching & BullMQ Alert Dispatch Engine
- **Phase 5 (Sprints 13–15):** Student PWA & APSRTC-Inspired Dynamic Route Manifest Engine
- **Phase 6 (Sprints 16–17):** Infrastructure Hardening, Stress Testing & Production Rollout

---

## 2. Phase Breakdown & Timeline Overview

| Phase | Sprints | Duration | Focus Area | Core Milestone Deliverable |
| :--- | :---: | :---: | :--- | :--- |
| **Phase 1: Ingestion Foundation** | Sprints 1–3 | Weeks 1–6 | Core Infra, Auth & Redis Ingestion | Sub-2ms Redis Ingestion (`POST /api/v1/telemetry/ping`) |
| **Phase 2: Real-Time Canvas** | Sprints 4–6 | Weeks 7–12 | SSE Broadcaster & WebGL Map Engine | 60 FPS LERP Map Rendering via SSE Fanout |
| **Phase 3: Driver Kiosk & Offline** | Sprints 7–9 | Weeks 13–18 | Android Foreground Daemon & Buffering | Native Driver App with Ring Buffer & Battery Exemption |
| **Phase 4: Emergency SOS Engine** | Sprints 10–12 | Weeks 19–24 | Proximity Match, BullMQ & Admin HUD | Emergency Dispatch & Relief Vehicle Reroute Control Tower |
| **Phase 5: Student PWA & Linear Tracking** | Sprints 13–15 | Weeks 25–30 | Student PWA & APSRTC Stop Manifest Engine | Dynamic Geofence Snapping & Linear Timeline UI Sync |
| **Phase 6: Hardening & Production** | Sprints 16–17 | Weeks 31–34 | System Hardening, Circuit Breakers & Audit | Production Launch for 100 Buses & 2,000+ Students |

---

## 3. Sprint-by-Sprint Execution Plan

### 3.1 Phase 1: Foundation, Infrastructure & Core Ingestion

#### Sprint 1: Project Scaffolding, Modular Architecture & Dockerized Environment
- **Objective:** Establish the development environment, Node.js 22 Fastify gateway, Redis 7 instance, Prisma v6 schema, and Docker Compose orchestration.
- **Key Tasks:**
  1. Initialize Node.js 22 LTS workspace with TypeScript 5.x and Fastify v5 application structure (`src/modules/{auth, telemetry, sos, routes}`).
  2. Configure Docker Compose for local development: Redis 7 container with geohash commands enabled, PostgreSQL 16 container with PostGIS extension.
  3. Initialize Prisma v6 ORM with Supabase transaction pooler connection settings (`DATABASE_URL_POOLED` on port `6543`, `connection_limit=10`).
  4. Setup GitHub Actions CI pipeline for linting, build checks, and TypeScript type validation.
- **Deliverables & Definition of Done (DoD):**
  - Executable `docker-compose up` bringing up Fastify, Redis 7, and PostgreSQL 16.
  - Passing automated type checks and linting rules.
- **Contract Mappings:** [02_system_architecture.md §5](https://github.com/Siddhu83/transport/docs/02_system_architecture.md#5-network--deployment-topology), [AGENT.md §2](https://github.com/Siddhu83/transport/AGENT.md#2-core-tech-stack-approved-versions-only).

#### Sprint 2: Core Data Models, PostgreSQL PostGIS Schemas & RBAC System
- **Objective:** Model user accounts, roles, routes, stops, and vehicles in PostgreSQL while delivering JWT authentication middleware.
- **Key Tasks:**
  1. Create Prisma schemas for `User`, `Role` (`SUPER_ADMIN`, `BUS_INCHARGE`, `DRIVER`, `STUDENT`), `Bus`, `Route`, `Stop`, and `RouteStop`.
  2. Implement PostGIS spatial columns (`GEOMETRY(LineString, 4326)` for route polylines and `GEOMETRY(Point, 4326)` for physical stops).
  3. Implement Fastify JWT authentication plugin (`@fastify/jwt`) with `HS256`/`RS256` token validation and RBAC guards.
  4. Build database seeding scripts containing mock data for 100 buses, 50 routes, 200 stops, and 2,000 student accounts.
- **Deliverables & Definition of Done (DoD):**
  - Database migrations applied cleanly with PostGIS types enabled.
  - Unit tests verifying JWT verification and role authorization matrix (`SUPER_ADMIN` down to `STUDENT`).
- **Contract Mappings:** [01_requirements_and_roles.md §2](https://github.com/Siddhu83/transport/docs/01_requirements_and_roles.md#2-role-based-access-control-rbac-matrix), [01_requirements_and_roles.md §3](https://github.com/Siddhu83/transport/docs/01_requirements_and_roles.md#3-actor-personas--functional-specifications).

#### Sprint 3: High-Frequency Telemetry Ingestion Hot Path (Fastify + Redis)
- **Objective:** Build the zero-database-write telemetry ingestion endpoint handling 60–100 coordinate updates every 2–4 seconds.
- **Key Tasks:**
  1. Implement `POST /api/v1/telemetry/ping` controller with Zod payload validation (`TelemetryPingSchema`).
  2. Build atomic Redis pipeline using `ioredis`: `GEOADD buses:live <lng> <lat> <busId>`, `HSET bus:<busId>:state`, and `EXPIRE bus:<busId>:state 30`.
  3. Implement ingestion guard checks: drop coordinates with accuracy \(> 35\text{m}\), suppress speed spikes \(> 140\text{ km/h}\), and reject timestamps with clock drift \(> \pm 60\text{s}\).
  4. Ensure absolute zero SQL calls or Prisma invocation within the ingestion handler path.
- **Deliverables & Definition of Done (DoD):**
  - Endpoint executing telemetry pings in under \(2\text{ ms}\) memory latency.
  - Integration tests verifying Redis key structure, geohash score, and TTL auto-expiration.
- **Contract Mappings:** [03_telemetry_and_realtime_protocol.md §2](https://github.com/Siddhu83/transport/docs/03_telemetry_and_realtime_protocol.md#2-ingestion-interface-contract-driver--backend), [AGENT.md §1.1](https://github.com/Siddhu83/transport/AGENT.md#1-system-invariants--strict-rules-do-not-violate).

---

### 3.2 Phase 2: Real-Time SSE Distribution & Map Engine

#### Sprint 4: Server-Sent Events (SSE) Distribution Engine & Redis Pub/Sub
- **Objective:** Build the high-efficiency real-time telemetry broadcaster streaming compact GeoJSON snapshots to connected clients.
- **Key Tasks:**
  1. Implement `GET /api/v1/telemetry/stream` SSE endpoint with proper headers (`text/event-stream`, `no-cache`, `keep-alive`).
  2. Implement Redis Pub/Sub listener on channel `telemetry:broadcast`.
  3. Build a **500ms micro-batch debounce throttle manager** in Fastify to aggregate coordinates into compact GeoJSON `FeatureCollection` snapshots.
  4. Implement route filtering parameter (`?routeId=<UUID>`) for student clients alongside global canvas view for Admin control tower.
- **Deliverables & Definition of Done (DoD):**
  - SSE manager fanning out snapshot frames at 500ms intervals to 2,000 concurrent listeners.
  - Heartbeat event emitter preventing network connection dropouts.
- **Contract Mappings:** [03_telemetry_and_realtime_protocol.md §4](https://github.com/Siddhu83/transport/docs/03_telemetry_and_realtime_protocol.md#4-client-distribution-stream-sse-protocol), [02_system_architecture.md §2](https://github.com/Siddhu83/transport/docs/02_system_architecture.md#2-telemetry-processing-pipeline-the-hot-path).

#### Sprint 5: WebGL Map Canvas Core & MapLibre GL JS Integration
- **Objective:** Setup the React 19 frontend application with Tailwind CSS v4 design tokens and hardware-accelerated MapLibre GL JS map layers.
- **Key Tasks:**
  1. Scaffold React 19 + Vite frontend application with Tailwind CSS v4 custom theme tokens (`--color-canvas-*`, `--color-status-*`).
  2. Create `FleetCanvas.tsx` wrapping MapLibre GL JS v4+ with custom obsidian dark-matter vector tile basemap.
  3. Implement WebGL `symbol` layer backed by a single GeoJSON source (`map.addSource('buses-source')`).
  4. Enforce strict rule: ZERO custom HTML DOM markers (`new maplibregl.Marker()`) anywhere in vehicle tracking components.
- **Deliverables & Definition of Done (DoD):**
  - Functional full-screen vector map maintaining 60 FPS while rendering 100 dynamic bus icons.
  - Design token architecture aligned with Airport FIDS high-contrast aesthetic.
- **Contract Mappings:** [05_frontend_guidelines.md §2](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#2-design-system--design-tokens-tailwind-css-v4--shadcnui), [05_frontend_guidelines.md §3](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#3-high-performance-map-implementation-maplibre-gl-js), [AGENT.md §1.2](https://github.com/Siddhu83/transport/AGENT.md#1-system-invariants--strict-rules-do-not-violate).

#### Sprint 6: Mathematical LERP Interpolation Engine & Vector State Buffer
- **Objective:** Implement client-side Linear Interpolation (LERP) movement smoothing and SSE stream integration hooks.
- **Key Tasks:**
  1. Build `useFleetInterpolation` hook utilizing continuous `requestAnimationFrame` animation loops.
  2. Implement mathematical LERP for `[lng, lat]` coordinates and heading angle wrap-around (\(0^\circ\) – \(360^\circ\)).
  3. Create `useTelemetryStream` hook for managing SSE connections, handling reconnection retries, and updating the LERP buffer.
  4. Add network status indicator pill (`[● LIVE 32ms]` / `[○ Reconnecting...]`) with tabular figure CSS (`tabular-nums`).
- **Deliverables & Definition of Done (DoD):**
  - Fluid, stutter-free vehicle movement between 3-second network telemetry intervals.
  - Zero layout shifts during numerical state changes.
- **Contract Mappings:** [05_frontend_guidelines.md §4](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#4-mathematical-client-side-smoothing-lerp-engine), [05_frontend_guidelines.md §6](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#6-real-time-telemetry-hook-integration).

---

### 3.3 Phase 3: Native Driver Kiosk & Cellular Dead-Zone Resilience

#### Sprint 7: Capacitor Native Android Container & Foreground Tracking Daemon
- **Objective:** Build the native Capacitor Android mobile wrapper with persistent foreground service for uninterrupted driver background tracking.
- **Key Tasks:**
  1. Initialize Capacitor v6 wrapper around the driver web application.
  2. Configure `AndroidManifest.xml` with permissions (`ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`).
  3. Implement native Android Foreground Service emitting persistent ongoing notification channel (`transit_driver_tracking_channel`, `IMPORTANCE_LOW`).
  4. Implement `requestBatteryExemption()` helper launching system intents to bypass Android Doze Mode restrictions.
- **Deliverables & Definition of Done (DoD):**
  - Standalone Android APK successfully running continuous location tracking when screen is locked or app is minimized.
  - Battery exemption prompt appearing cleanly on first driver login.
- **Contract Mappings:** [06_resilience_and_failure_modes.md §2](https://github.com/Siddhu83/transport/docs/06_resilience_and_failure_modes.md#2-mobile-os-survival-matrix-driver-android-background-telemetry).

#### Sprint 8: Cellular Dead-Zone Buffering & Batch Drain Flush Protocol
- **Objective:** Implement driver-side offline ring buffer and server-side batch ingestion endpoints for handling cellular dead spots.
- **Key Tasks:**
  1. Build `TelemetryBuffer` TypeScript class on the driver app (FIFO ring buffer capped at 20 pings / ~60s history).
  2. Implement network offline/online listener triggering automatic buffer queueing during disconnects.
  3. Implement `POST /api/v1/telemetry/batch-drain` endpoint on Fastify.
  4. Implement server-side LERP guard: extract latest coordinate for Redis `GEOADD` while routing older points exclusively to audit logs.
- **Deliverables & Definition of Done (DoD):**
  - Zero coordinate loss during simulated 60-second cellular disconnects.
  - Server preventing spatial rubber-banding on client map canvas during batch flushes.
- **Contract Mappings:** [06_resilience_and_failure_modes.md §3](https://github.com/Siddhu83/transport/docs/06_resilience_and_failure_modes.md#3-cellular-dead-zone-buffering--reconnection-protocol).

#### Sprint 9: Driver Kiosk UI & 1-Tap SOS Breakdown Interface
- **Objective:** Create a distraction-free, high-contrast night-mode kiosk UI for drivers with safety controls.
- **Key Tasks:**
  1. Design driver dashboard using high-contrast dark theme with 72x72px touch targets.
  2. Implement primary operational button: 2-second press-and-hold `[TRIGGER SOS BREAKDOWN]` with radial progress ring animation.
  3. Build 1-tap modal selector for stranded passenger bands (`<15`, `15-30`, `30-50`, `50+`) and failure reasons.
  4. Build active route shift binding interface (`busId` + `routeId` binding).
- **Deliverables & Definition of Done (DoD):**
  - Kiosk interface verified against touch target guidelines, preventing accidental pocket triggers.
  - Complete driver workflow from shift start to telemetry emission and breakdown trigger.
- **Contract Mappings:** [05_frontend_guidelines.md §5.2](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#52-driver-tracking-console-distraction-free-kiosk), [01_requirements_and_roles.md §3.2](https://github.com/Siddhu83/transport/docs/01_requirements_and_roles.md#32-driver-persona).

---

### 3.4 Phase 4: Emergency SOS Engine & Control Tower HUD

#### Sprint 10: In-Memory SOS Breakdown Engine & Radius Sweep Algorithm
- **Objective:** Implement the backend SOS incident controller and sub-millisecond Redis candidate vehicle matching algorithm.
- **Key Tasks:**
  1. Implement `POST /api/v1/sos/trigger` endpoint with Zod schema validation (`SosTriggerSchema`).
  2. Implement Prisma `SosIncident` database transaction creating an `OPEN` incident record.
  3. Implement `findCandidateReliefBuses()` function using Redis `GEOSEARCH buses:live FROMLONLAT <lng> <lat> BYRADIUS 5 KM ASC`.
  4. Filter candidates by querying `bus:<busId>:state` hashes to exclude disabled or offline vehicles.
- **Deliverables & Definition of Done (DoD):**
  - Sub-5ms proximity search returning ordered candidate relief buses within 5km of breakdown coordinates.
  - Database incident creation completing with state `OPEN`.
- **Contract Mappings:** [04_sos_and_dispatch_workflow.md §2](https://github.com/Siddhu83/transport/docs/04_sos_and_dispatch_workflow.md#2-emergency-trigger-contract-driverin-charge), [04_sos_and_dispatch_workflow.md §3](https://github.com/Siddhu83/transport/docs/04_sos_and_dispatch_workflow.md#3-candidate-matching--proximity-algorithm).

#### Sprint 11: Asynchronous BullMQ Queue & Multi-Channel Alert Pipeline
- **Objective:** Build background worker jobs for FCM/APNS push alerts, candidate driver notifications, and fallback SMS dispatch.
- **Key Tasks:**
  1. Setup BullMQ queue (`sos-incident-processing`) backed by Redis connection.
  2. Implement `sosWorker` process handling high-priority FCM/APNS push notifications with critical sound channel (`critical: 1`).
  3. Implement relief driver dispatch notifications targeting top candidate vehicles.
  4. Implement fallback SMS dispatch via Twilio API if incident remains unacknowledged after 180 seconds.
- **Deliverables & Definition of Done (DoD):**
  - Fastify event loop unblocked (returning `202 Accepted` to driver in \(< 200\text{ ms}\)).
  - Background worker processing notifications with exponential retry policies (3 attempts).
- **Contract Mappings:** [04_sos_and_dispatch_workflow.md §4](https://github.com/Siddhu83/transport/docs/04_sos_and_dispatch_workflow.md#4-background-notification-pipeline-bullmq-queue), [AGENT.md §1.4](https://github.com/Siddhu83/transport/AGENT.md#1-system-invariants--strict-rules-do-not-violate).

#### Sprint 12: Super Admin Incident Control Tower & Rerouting HUD
- **Objective:** Build the Super Admin split-canvas HUD for monitoring all fleet vehicles and authorizing 1-click relief diversions.
- **Key Tasks:**
  1. Implement Admin split-canvas dashboard: 360px vehicle roster sidebar + full-bleed MapLibre global canvas.
  2. Build SOS incident fly-to camera automation rendering pulsing red target rings and 5km perimeter circles around breakdowns.
  3. Implement candidate relief bus recommendation drawer sorted by calculated ETA.
  4. Build 1-click `[Authorize Diversion]` action pushing detours to selected relief drivers and resolving incidents (`POST /api/v1/sos/:id/resolve`).
- **Deliverables & Definition of Done (DoD):**
  - Fully interactive Control Tower HUD allowing 1-click rescue authorization.
  - Complete incident state machine lifecycle execution (`OPEN` \(\to\) `DISPATCHED` \(\to\) `RESOLVED`).
- **Contract Mappings:** [05_frontend_guidelines.md §5.3](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#53-super-admin-control-tower-incident-room-hud), [04_sos_and_dispatch_workflow.md §1](https://github.com/Siddhu83/transport/docs/04_sos_and_dispatch_workflow.md#1-incident-lifecycle-state-machine).

---

### 3.5 Phase 5: Student PWA, Resilience & Production Rollout

#### Sprint 13: Student Mobile PWA & Bottom Sheet UX Architecture
- **Objective:** Develop the Student Mobile PWA with offline caching, bottom sheet drawer, and live emergency broadcast overlays.
- **Key Tasks:**
  1. Build Student Mobile PWA with Service Worker static asset caching for offline resilience (`public/sw.js`).
  2. Implement native glassmorphism bottom drawer with 2 snap points (Collapsed 96px ETA card / Expanded route stop list) without third-party library bloat.
  3. Implement route stop visualizer highlighting completed stops, active vehicle location, and upcoming arrival timestamps.
  4. Implement emergency breakdown overlay banner displaying replacement bus details when assigned vehicle triggers SOS.
- **Deliverables & Definition of Done (DoD):**
  - Student PWA loading in < 1s on 4G cellular networks.
  - Live route progression visualization verified against student persona requirements.
  - Streamlined 3-tab layout (`Home`, `My Bus`, `Settings`) with zero third-party sheet dependencies; redundant public transit routes catalog view removed.
- **Contract Mappings:** [05_frontend_guidelines.md §5.1](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#51-student-mobile-pwa-bottom-sheet-architecture), [01_requirements_and_roles.md §3.1](https://github.com/Siddhu83/transport/docs/01_requirements_and_roles.md#31-student-persona).

#### Sprint 14: Dynamic Linear Route Manifest, Polyline Snapping & Stop Geofence Engine
- **Objective:** Build the backend spatial map-matching and geofence state engine to project live vehicle telemetry onto linear route sequences with dynamic ETA calculations.
- **Key Tasks:**
  1. Enhance RouteStop and Stop data models in Prisma with `distanceFromOriginKm` and `geofenceRadiusMeters` properties.
  2. Implement spatial snap-to-polyline algorithm projecting raw vehicle coordinates `(lat, lng)` to nearest route polyline index and calculating cumulative linear distance covered.
  3. Build 3-state Stop Geofence State Machine (`APPROACHING` \(\le 400\text{m}\), `AT_STOP` \(\le 50\text{m}\), `DEPARTED` \(> 100\text{m}\)) with departure timestamp tracking.
  4. Implement `GET /api/v1/routes/:id/manifest` and enrich SSE telemetry payload with live stop progression metadata (`currentStopOrder`, `nextStopName`, `etaSeconds`, `status`).
- **Deliverables & Definition of Done (DoD):**
  - Sub-3ms linear progress and ETA computation on active telemetry pings.
  - Zero database writes on the telemetry hot path; live route progression cached in Redis hash `bus:<busId>:progress`.
- **Contract Mappings:** [03_telemetry_and_realtime_protocol.md §2](https://github.com/Siddhu83/transport/docs/03_telemetry_and_realtime_protocol.md#2-ingestion-interface-contract-driver--backend), [02_system_architecture.md §2](https://github.com/Siddhu83/transport/docs/02_system_architecture.md#2-telemetry-processing-pipeline-the-hot-path).

#### Sprint 15: APSRTC-Style Linear Stop Sequence UI & Real-Time Sync
- **Objective:** Replace static and hardcoded stop components in the Student Portal and Driver Kiosk with live, synchronized linear route sequence visualizers.
- **Key Tasks:**
  1. In Student Portal `RideStatusSheet.tsx`: replace hardcoded mock stops (`STOPS_TIMELINE`) and mock next stop labels with dynamic `<LinearRouteManifest />`.
  2. Build animated Bus Glider indicator smoothly advancing down the vertical connector line between completed and upcoming stops based on live progress.
  3. In Driver Console `Card 2`: bind live stop sequence auto-advancing checkmarks upon geofence detection, with 1-tap manual override (`[Confirm Arrival]` / `[Skip Stop]`).
  4. Ensure end-to-end sync: when driver starts transit duty and enters a stop geofence, both Driver Console and Student Portal update simultaneously via SSE.
- **Deliverables & Definition of Done (DoD):**
  - Elimination of all hardcoded stop arrays in `RideStatusSheet.tsx` and `DRIVER_APP/src/App.tsx`.
  - Fluid vertical timeline visualization displaying accurate past departures, live en-route target, and arrival countdown.
- **Contract Mappings:** [05_frontend_guidelines.md §5.1](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#51-student-mobile-pwa-bottom-sheet-architecture), [05_frontend_guidelines.md §5.2](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md#52-driver-tracking-console-distraction-free-kiosk).

---

### 3.6 Phase 6: System Hardening, Stress Testing & Production Rollout

#### Sprint 16: System Hardening, Circuit Breakers & Health Probes
- **Objective:** Enforce infrastructure resilience, database statement timeouts, circuit breaker fallbacks, and health checks.
- **Key Tasks:**
  1. Implement Fastify circuit breakers tripping at \(> 50\%\) failure rate within 10s window (returning HTTP 503).
  2. Enforce Prisma 5,000ms query statement timeout middleware across all database queries.
  3. Implement `/healthz` liveness and `/readyz` readiness endpoints checking Redis ping and PostgreSQL connection pool.
  4. Implement API rate limiting and global error handlers preventing Node process crashes.
- **Deliverables & Definition of Done (DoD):**
  - Application gracefully returning 503 during simulated Redis or Database outages without dumping stack traces.
  - Health probes integrated for Docker container orchestrator monitoring.
- **Contract Mappings:** [06_resilience_and_failure_modes.md §4](https://github.com/Siddhu83/transport/docs/06_resilience_and_failure_modes.md#4-database--cache-circuit-breakers), [06_resilience_and_failure_modes.md §5](https://github.com/Siddhu83/transport/docs/06_resilience_and_failure_modes.md#5-health-probes--disaster-triage-matrix).

#### Sprint 17: End-to-End Stress Testing, Security Audit & Production Launch
- **Objective:** Conduct high-throughput load testing, security penetration testing, 5-bus pilot field test, and deploy to production environment.
- **Key Tasks:**
  1. Conduct K6 load test simulating 100 concurrent drivers emitting telemetry at 2-second intervals while 2,000 student SSE streams run concurrently.
  2. Verify performance metrics: telemetry fanout \(< 200\text{ ms}\), Redis write latency \(< 2\text{ ms}\), and client 60 FPS frame rate.
  3. Perform security audit verifying JWT signature validation, payload tamper prevention, and TLS 1.3 encryption.
  4. Conduct 5-bus live field trial on campus and execute final deployment to Cloudflare Edge + VPS Nginx + Supabase Managed DB.
- **Deliverables & Definition of Done (DoD):**
  - Load test results proving system stability under peak load without database write contention.
  - Live production deployment running 60–100 operational buses serving 2,000+ students.
- **Contract Mappings:** [01_requirements_and_roles.md §4](https://github.com/Siddhu83/transport/docs/01_requirements_and_roles.md#4-non-functional-requirements-nfrs), [02_system_architecture.md §5](https://github.com/Siddhu83/transport/docs/02_system_architecture.md#5-network--deployment-topology).

---

## 4. Sprint Dependency Mapping Matrix

```
[Sprint 1: Infra & Docker] ──▶ [Sprint 2: Data Schemas & Auth] ──▶ [Sprint 3: Redis Telemetry Ingestion]
                                                                                │
  ┌─────────────────────────────────────────────────────────────────────────────┘
  ▼
[Sprint 4: SSE Fanout Engine] ──▶ [Sprint 5: WebGL Map Canvas] ──▶ [Sprint 6: LERP Math Engine]
                                                                                │
  ┌─────────────────────────────────────────────────────────────────────────────┘
  ▼
[Sprint 7: Android Foreground Service] ──▶ [Sprint 8: Cellular Ring Buffer] ──▶ [Sprint 9: Driver Kiosk UI]
                                                                                           │
  ┌────────────────────────────────────────────────────────────────────────────────────────┘
  ▼
[Sprint 10: In-Memory SOS Match] ──▶ [Sprint 11: BullMQ Alerts Pipeline] ──▶ [Sprint 12: Admin Control Tower]
                                                                                           │
  ┌────────────────────────────────────────────────────────────────────────────────────────┘
  ▼
[Sprint 13: Student PWA Bottom Sheet] ──▶ [Sprint 14: Stop Geofence Engine] ──▶ [Sprint 15: APSRTC Linear UI Sync]
                                                                                           │
  ┌────────────────────────────────────────────────────────────────────────────────────────┘
  ▼
[Sprint 16: Circuit Breakers & Probes] ──▶ [Sprint 17: Load Testing & Production Launch]
```

### Technical Component Mapping Matrix

| Sprint | Dependent On | Primary Modules Created / Modified | Artifact Contracts Enforced | Risk Level |
| :---: | :--- | :--- | :--- | :---: |
| **Sprint 1** | None | `src/index.ts`, `docker-compose.yml`, `prisma/schema.prisma` | AGENT §2, Arch §5 | Low |
| **Sprint 2** | Sprint 1 | `src/modules/auth/*`, `prisma/migrations/*` | Req §2, Req §3 | Medium |
| **Sprint 3** | Sprint 2 | `src/modules/telemetry/ingest.ts`, `src/infrastructure/redis.ts` | Protocol §2, AGENT §1.1 | High |
| **Sprint 4** | Sprint 3 | `src/modules/telemetry/stream.ts`, `src/services/sseHub.ts` | Protocol §4, Arch §2 | High |
| **Sprint 5** | Sprint 4 | `frontend/src/components/map/FleetCanvas.tsx` | Frontend §2, Frontend §3 | Medium |
| **Sprint 6** | Sprint 5 | `frontend/src/hooks/useLerpMovement.ts`, `useTelemetryStream.ts` | Frontend §4, Frontend §6 | Medium |
| **Sprint 7** | Sprint 2 | `android/app/src/main/AndroidManifest.xml`, `TrackingService.java` | Resilience §2 | High |
| **Sprint 8** | Sprint 3, 7 | `src/services/telemetryBuffer.ts`, `POST /telemetry/batch-drain` | Resilience §3 | Medium |
| **Sprint 9** | Sprint 7, 8 | `frontend/src/pages/driver/Console.tsx` | Frontend §5.2, Req §3.2 | Low |
| **Sprint 10** | Sprint 3 | `src/modules/sos/trigger.ts`, `src/services/proximity.ts` | SOS §2, SOS §3 | High |
| **Sprint 11** | Sprint 10 | `src/queues/sosQueue.ts`, `src/workers/sosWorker.ts` | SOS §4, AGENT §1.4 | Medium |
| **Sprint 12** | Sprint 6, 11 | `frontend/src/pages/admin/ControlTower.tsx` | Frontend §5.3, SOS §1 | Medium |
| **Sprint 13** | Sprint 6 | `frontend/src/components/mobile/RideStatusSheet.tsx`, `public/sw.js` | Frontend §5.1, Req §3.1 | Low |
| **Sprint 14** | Sprint 3, 13 | `src/modules/routes/manifest.ts`, `src/services/geofenceEngine.ts` | Protocol §2, Arch §2 | High |
| **Sprint 15** | Sprint 14 | `RideStatusSheet.tsx`, `DRIVER_APP/src/App.tsx` (Card 2) | Frontend §5.1, Frontend §5.2 | Medium |
| **Sprint 16** | Sprint 3, 11 | `src/infrastructure/circuitBreaker.ts`, `src/modules/health/*` | Resilience §4, Resilience §5 | High |
| **Sprint 17** | All (1–16) | `tests/load/k6-telemetry.js`, Deployment configs | Req §4, Arch §5 | Critical |

---

## 5. Architectural Invariants Validation Checklist

Before declaring any sprint milestone complete, engineering teams must verify code against these mandatory invariants:

- [ ] **Zero Database Writes on Hot Path:** Telemetry ingestion emits zero PostgreSQL queries. Coordinates route strictly to Redis memory (`GEOADD buses:live`).
- [ ] **Zero HTML DOM Markers:** All map canvas vehicle updates render via MapLibre GL JS WebGL Symbol Layers (`map.getSource('buses').setData()`).
- [ ] **Fastify Event Loop Protection:** All SOS notification side-effects (APNS, FCM, Twilio SMS) run asynchronously inside BullMQ workers.
- [ ] **Connection Pool Isolation:** Prisma database connections pass through Supavisor port `6543` with `connection_limit=10`.
- [ ] **Mobile Background Survival:** Driver tracking daemon runs as an Android 14+ Foreground Service (`location` type) with battery exemption.
- [ ] **Tabular Figures for Telemetry Metrics:** Numerical UI text uses `tabular-nums` font styling to prevent layout shifts.
