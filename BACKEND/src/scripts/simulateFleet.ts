import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production-32-chars-min';

// Dependency-free HMAC-SHA256 JWT Token Signer
function createDriverToken(driverId: string, email: string, busId: string, routeId: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    userId: driverId,
    email: email,
    role: 'DRIVER',
    assignedBusId: busId,
    assignedRouteId: routeId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours valid
  };

  const base64Url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const encodedHeader = base64Url(header);
  const encodedPayload = base64Url(payload);
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(signatureInput)
    .digest('base64url');

  return `${signatureInput}.${signature}`;
}

// Calculate bearing/heading angle (0 - 359 degrees relative to True North)
function calculateHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const rLat1 = lat1 * (Math.PI / 180);
  const rLat2 = lat2 * (Math.PI / 180);

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  let brng = Math.atan2(y, x) * (180 / Math.PI);
  brng = (brng + 360) % 360;
  return Math.round(brng);
}

// Fixed UUIDs for 5 Buses & 5 Routes
const BUSES = [
  {
    busId: '11111111-1111-4111-8111-111111111111',
    routeId: 'a1111111-1111-4111-8111-111111111111',
    plate: 'AP-39-TV-1001',
    name: 'ANITS Campus Circle Express',
    driverEmail: 'driver1@transport.college.edu',
    centerLat: 17.9045,
    centerLng: 83.4215,
    radius: 0.015,
    pattern: 'circle',
    speedBase: 35,
  },
  {
    busId: '22222222-2222-4222-8222-222222222222',
    routeId: 'b2222222-2222-4222-8222-222222222222',
    plate: 'AP-39-TV-1002',
    name: 'Tagarapuvalasa City Line',
    driverEmail: 'driver2@transport.college.edu',
    centerLat: 17.9150,
    centerLng: 83.4100,
    radius: 0.020,
    pattern: 'figure8',
    speedBase: 42,
  },
  {
    busId: '33333333-3333-4333-8333-333333333333',
    routeId: 'c3333333-3333-4333-8333-333333333333',
    plate: 'AP-39-TV-1003',
    name: 'Anandapuram Highway Shuttle',
    driverEmail: 'driver3@transport.college.edu',
    centerLat: 17.8900,
    centerLng: 83.4350,
    radius: 0.025,
    pattern: 'oval_east',
    speedBase: 50,
  },
  {
    busId: '44444444-4444-4444-8444-444444444444',
    routeId: 'd4444444-4444-4444-8444-444444444444',
    plate: 'AP-39-TV-1004',
    name: 'Bheemili Coastal Transit',
    driverEmail: 'driver4@transport.college.edu',
    centerLat: 17.8800,
    centerLng: 83.4500,
    radius: 0.018,
    pattern: 'wave',
    speedBase: 30,
  },
  {
    busId: '55555555-5555-4555-8555-555555555555',
    routeId: 'e5555555-5555-4555-8555-555555555555',
    plate: 'AP-39-TV-1005',
    name: 'Outer Perimeter Ring Shuttle',
    driverEmail: 'driver5@transport.college.edu',
    centerLat: 17.9000,
    centerLng: 83.4200,
    radius: 0.035,
    pattern: 'large_ring',
    speedBase: 48,
  },
];

// Generate next position along route pattern
function getPosition(bus: typeof BUSES[0], angle: number): { lat: number; lng: number } {
  const { centerLat, centerLng, radius, pattern } = bus;

  switch (pattern) {
    case 'figure8':
      return {
        lat: centerLat + radius * Math.sin(angle),
        lng: centerLng + radius * Math.sin(2 * angle) * 0.8,
      };
    case 'oval_east':
      return {
        lat: centerLat + radius * 0.6 * Math.sin(angle),
        lng: centerLng + radius * 1.4 * Math.cos(angle),
      };
    case 'wave':
      return {
        lat: centerLat + radius * Math.sin(angle),
        lng: centerLng + (angle / (2 * Math.PI)) * 0.03 - 0.015,
      };
    case 'large_ring':
      return {
        lat: centerLat + radius * Math.sin(-angle),
        lng: centerLng + radius * Math.cos(-angle),
      };
    case 'circle':
    default:
      return {
        lat: centerLat + radius * Math.sin(angle),
        lng: centerLng + radius * Math.cos(angle),
      };
  }
}

async function startSimulation() {
  console.info('====================================================');
  console.info('🚍 ANITS Campus Fleet Telemetry Simulator Started');
  console.info(`📡 Target Gateway: ${API_BASE_URL}/api/v1/telemetry/ping`);
  console.info('====================================================\n');

  // Pre-generate JWT tokens for all 5 drivers
  const driverTokens = BUSES.map((bus, idx) => ({
    ...bus,
    token: createDriverToken(
      `driver-user-id-${idx + 1}`,
      bus.driverEmail,
      bus.busId,
      bus.routeId
    ),
    angle: (idx * Math.PI) / 2.5, // Stagger initial starting positions
  }));

  let tickCount = 0;

  setInterval(async () => {
    tickCount++;
    const now = Date.now();
    console.info(`--- Telemetry Cycle #${tickCount} [${new Date(now).toLocaleTimeString()}] ---`);

    for (const bus of driverTokens) {
      // Step angle forward slightly
      bus.angle += 0.05;
      if (bus.angle > 2 * Math.PI * 100) bus.angle = 0;

      // Current position and next position (for heading calculation)
      const currentPos = getPosition(bus, bus.angle);
      const nextPos = getPosition(bus, bus.angle + 0.01);

      const heading = calculateHeading(
        currentPos.lat,
        currentPos.lng,
        nextPos.lat,
        nextPos.lng
      );

      // Speed with slight variance (e.g. traffic slowdowns)
      const speed = Math.max(10, Math.round(bus.speedBase + Math.sin(tickCount * 0.2) * 8));
      const accuracy = Math.round(5 + Math.random() * 5); // 5-10m GPS accuracy

      const payload = {
        busId: bus.busId,
        routeId: bus.routeId,
        latitude: Number(currentPos.lat.toFixed(6)),
        longitude: Number(currentPos.lng.toFixed(6)),
        speed,
        heading,
        accuracy,
        timestamp: now,
      };

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/telemetry/ping`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bus.token}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.info(
            `  ✅ [${bus.plate}] ${bus.name.padEnd(28)} | Lat: ${payload.latitude.toFixed(4)}, Lng: ${payload.longitude.toFixed(4)} | Speed: ${speed} km/h | Heading: ${heading}°`
          );
        } else {
          const errData = await response.json().catch(() => ({}));
          console.warn(
            `  ⚠️ [${bus.plate}] Ingestion Refused (${response.status}):`,
            errData
          );
        }
      } catch (err) {
        console.error(
          `  ❌ [${bus.plate}] Network Error:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.info('');
  }, 1000); // Emit telemetry ping every 1000ms
}

startSimulation();
