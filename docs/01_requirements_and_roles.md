# 01. Requirements, User Roles, and Business Rules

## 1. System Scope & Core Scale Constraints

- **Fleet Scale:** 60 to 100 concurrently operational buses.
- **Active Student Base:** ~2,000 students accessing the system during peak morning (07:00 – 09:30) and afternoon/evening (15:30 – 18:00) transit windows.
- **Telemetry Throughput:** 60–100 coordinate updates every 2 to 4 seconds (peak write volume: 15–50 write operations/sec into memory).
- **Latency Budget:** Driver-to-Student display propagation latency must remain below 1.5 seconds under normal 4G/5G cellular conditions.

---

## 2. Role-Based Access Control (RBAC) Matrix

The system enforces four deterministic roles via cryptographically signed JWT tokens (`HS256` or `RS256`).

| Resource / Action | Super Admin | Bus In-Charge | Driver | Student |
| :--- | :---: | :---: | :---: | :---: |
| **Manage Fleet (Buses, Routes, Stops)** | Full CRUD | Read-Only | Read-Only | Read-Only |
| **Manage Users & Role Assignments** | Full CRUD | None | None | None |
| **Stream Telemetry (Emit GPS)** | None | None | **Write** (Assigned bus only) | None |
| **Global Canvas Map View** | **Read** (All buses) | **Read** (All buses) | Read (Own route) | **Read** (Assigned/All) |
| **Trigger Emergency SOS** | Override / Cancel | **Write** (Active bus) | **Write** (Active bus) | None |
| **Authorize SOS Diversion/Reroute** | **Approve / Dispatch** | Acknowledge | Follow Directives | Read Alerts |
| **View Audit Logs & Incidents** | Full Read | Route-scoped | None | None |

---

## 3. Actor Personas & Functional Specifications

### 3.1 Student Persona
- **Primary Goal:** Track their designated route vehicle, anticipate arrival time, and receive real-time emergency service interruption notices.
- **Functional Requirements:**
  - **FR-S1 (Authentication-Light):** Instant session launch with roll-number/email and persistent JWT storage in browser local storage.
  - **FR-S2 (Live Vector Canvas):** Hardware-accelerated map showing the real-time position, direction vector, and speed of their assigned bus.
  - **FR-S3 (Stop Arrival Awareness):** Visual representation of all stops on their route, highlighting completed, current, and upcoming stops.
  - **FR-S4 (Emergency Broadcast Banner):** Automatic UI overlay alerting the student if their assigned bus reports an SOS breakdown, showing the re-routed replacement vehicle.

### 3.2 Driver Persona
- **Primary Goal:** Stream accurate GPS telemetry reliably without manual app maintenance while operating the vehicle.
- **Functional Requirements:**
  - **FR-D1 (Shift Initialization):** Authenticate and bind their device to an assigned `busId` and active `routeId`.
  - **FR-D2 (Persistent Tracking Daemon):** Runs a native Android Foreground Service with a sticky system notification (`"Transit Tracker Active"`).
  - **FR-D3 (1-Tap SOS Breakdown Trigger):** Large, prominent dashboard trigger to dispatch an immediate SOS signal with a 1-tap stranded passenger count selector (`[<15]`, `[15-30]`, `[30-50]`, `[Full: 50+]`).

### 3.3 Bus In-Charge Persona
- **Primary Goal:** Assist the driver with operational duties, verify route status, and manage emergency incident coordination.
- **Functional Requirements:**
  - **FR-I1 (Secondary SOS Dispatch):** Authority to trigger or cancel an SOS incident if the driver's device loses power or connectivity.
  - **FR-I2 (Direct Dispatch Comm Channel):** View incoming detour/redirection directives pushed by Super Admins.

### 3.4 Super Admin (Transport Manager) Persona
- **Primary Goal:** Real-time visibility across the entire fleet, route scheduling, and emergency diversion management.
- **Functional Requirements:**
  - **FR-A1 (Global Canvas Control Tower):** Single-pane dashboard rendering all 60–100 active vehicles simultaneously using MapLibre GL JS symbol layers.
  - **FR-A2 (Emergency Incident Resolver):** Real-time visualization of disabled vehicles, candidate relief vehicles within an \(R\)-km radius, and 1-click authorization of backup passenger pickup routes.

---

## 4. Non-Functional Requirements (NFRs)

### 4.1 Performance & Latency
- **NFR-P1 (Telemetry Fanout):** Time elapsed between telemetry ingestion into Fastify and distribution over Server-Sent Events (SSE) must be \(< 200\text{ ms}\).
- **NFR-P2 (Memory Ingestion Efficiency):** Telemetry writes to Redis via `GEOADD` and hash updates must execute in under \(2\text{ ms}\) (\(\mathcal{O}(\log N)\)).
- **NFR-P3 (Client Frame Rate):** Map rendering must maintain a consistent 60 FPS on mid-tier mobile browsers during marker interpolation using `requestAnimationFrame`.

### 4.2 Availability & Resilience
- **NFR-A1 (Stateless Ingestion Node):** Fastify compute instances must maintain zero internal session state; any instance crash must not lose active bus registry keys, which reside in Redis.
- **NFR-A2 (Graceful Degradation under Signal Loss):** If a bus fails to emit coordinates for \(> 25\text{ seconds}\), the frontend renders the vehicle as "Stale / Network Lost" without dropping the marker from the map.

### 4.3 Security & Compliance
- **NFR-S1 (Payload Tamper Prevention):** Drivers cannot emit coordinates for vehicles they are not actively assigned to in the PostgreSQL roster.
- **NFR-S2 (Transport Encryption):** All HTTP and SSE connections must be encrypted via TLS 1.3 (HTTPS / WSS).