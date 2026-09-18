# College Transport Management System

A high-throughput, sub-second latency real-time transport tracking and emergency dispatch platform designed for a fleet of 60–100 college buses serving 2,000+ concurrent students.

---

## 🚀 Key System Features

- **Sub-Second Telemetry Hot Path:** Zero database queries on live coordinate updates. Ingestion uses Fastify and Redis 7 memory-geospatial indexing (`GEOADD` / `GEOSEARCH`), streaming coordinates via Server-Sent Events (SSE).
- **Hardware-Accelerated Vector Canvas:** MapLibre GL JS WebGL Symbol Layers rendering 60 FPS smooth movement with client-side Linear Interpolation (LERP), eliminating DOM marker layout thrashing.
- **Resilient Emergency SOS Dispatch:** 1-Tap SOS trigger for drivers with BullMQ background processing for APNS/FCM critical push alerts, SMS notifications, and radius-based backup vehicle rerouting.
- **Strict Role-Based Access (RBAC):** JWT-secured access control tailored for Students, Drivers, Bus In-Charges, and Super Admin Control Tower operators.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Runtime & Gateway** | Node.js 22 LTS, Fastify v5 |
| **In-Memory Cache & Geo** | Redis 7 (`GEOADD`, `GEOSEARCH`, Pub/Sub) |
| **Background Jobs** | BullMQ v5 backed by Redis |
| **Database & ORM** | Supabase PostgreSQL 16 (PostGIS) via Prisma v6 |
| **Frontend Framework** | React 19, Vite, Tailwind CSS v4, shadcn/ui |
| **Map Engine** | MapLibre GL JS v4+ (WebGL symbol layers + LERP engine) |
| **Mobile Driver App** | Capacitor v6 with Native Android Foreground Daemon |

---

## 📚 Documentation Directory

Explore the detailed architecture and specification documents:

1. [01. Requirements, User Roles & Business Rules](https://github.com/Siddhu83/transport/docs/01_requirements_and_roles.md) — Scale constraints, RBAC matrix, personas, and non-functional requirements.
2. [02. System Architecture & Topology](https://github.com/Siddhu83/transport/docs/02_system_architecture.md) — Hot/cold data plane separation, topology diagram, and BullMQ worker pipeline.
3. [03. Telemetry & Real-Time Protocol Specification](https://github.com/Siddhu83/transport/docs/03_telemetry_and_realtime_protocol.md) — Ingestion contracts, Zod schemas, Redis memory structures, and SSE streaming.
4. [04. SOS Breakdown & Emergency Dispatch Workflow](https://github.com/Siddhu83/transport/docs/04_sos_and_dispatch_workflow.md) — Incident lifecycle state machine, candidate matching algorithms, and BullMQ worker jobs.
5. [05. Frontend Engineering & UI/UX Standards](https://github.com/Siddhu83/transport/docs/05_frontend_guidelines.md) — FIDS design tokens, WebGL map integration, LERP math engine, and UX layout wireframes.
6. [06. Resilience, Failure Modes & Disaster Recovery](https://github.com/Siddhu83/transport/docs/06_resilience_and_failure_modes.md) — Mobile OS background survival, cellular ring buffer, circuit breakers, and triage playbook.
7. [07. 15-Sprint Engineering Roadmap](https://github.com/Siddhu83/transport/docs/07_sprint_roadmap.md) — 15-sprint delivery plan, task mapping matrix, milestones, and technical dependencies.
8. [AGENT Instructions](https://github.com/Siddhu83/transport/AGENT.md) — System invariants, strict coding rules, and core tech stack constraints.