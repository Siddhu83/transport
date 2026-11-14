import { describe, it, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  projectPointToSegment,
  snapToPolyline,
  evaluateVehicleProgress,
  evaluateVehicleDetour,
  _resetDetourMemoryStore,
  clearVehicleProgress,
} from '../geofenceEngine.js';
import { RouteManifest } from '../../modules/routes/routes.schemas.js';
import { TelemetryPing } from '../../modules/telemetry/telemetry.schemas.js';
import { redis } from '../../infrastructure/redis.js';

describe('Geofence & Polyline Snapping Engine (Sprint 14)', () => {
  after(() => {
    redis.disconnect();
  });
  describe('projectPointToSegment', () => {
    it('should clamp to start when point is behind start point A', () => {
      const latA = 17.0, lngA = 78.0;
      const latB = 17.0, lngB = 78.1;
      const pLat = 17.0, pLng = 77.9; // west of A

      const result = projectPointToSegment(pLat, pLng, latA, lngA, latB, lngB);
      assert.equal(result.t, 0);
      assert.equal(result.projLat, latA);
      assert.equal(result.projLng, lngA);
    });

    it('should clamp to end when point is past end point B', () => {
      const latA = 17.0, lngA = 78.0;
      const latB = 17.0, lngB = 78.1;
      const pLat = 17.0, pLng = 78.2; // east of B

      const result = projectPointToSegment(pLat, pLng, latA, lngA, latB, lngB);
      assert.equal(result.t, 1);
      assert.equal(result.projLat, latB);
      assert.equal(result.projLng, lngB);
    });

    it('should project point onto midpoint of horizontal segment', () => {
      const latA = 17.0, lngA = 78.0;
      const latB = 17.0, lngB = 78.2;
      const pLat = 17.01, pLng = 78.1; // north of midpoint

      const result = projectPointToSegment(pLat, pLng, latA, lngA, latB, lngB);
      assert.ok(Math.abs(result.t - 0.5) < 0.01);
      assert.equal(result.projLat, 17.0);
      assert.ok(Math.abs(result.projLng - 78.1) < 0.001);
    });
  });

  describe('snapToPolyline', () => {
    const polyline: [number, number][] = [
      [78.0, 17.0], // origin
      [78.1, 17.0], // stop 1 (~10.6 km east)
      [78.1, 17.1], // stop 2 (~11.1 km north)
    ];

    it('should project onto first segment and compute correct linear distance', () => {
      const snapped = snapToPolyline(17.001, 78.05, polyline);
      assert.equal(snapped.segmentIndex, 0);
      assert.ok(snapped.linearDistanceKm > 4.5 && snapped.linearDistanceKm < 6.0);
      assert.ok(snapped.distanceToPolylineMeters < 150);
    });

    it('should project onto second segment when vehicle turns north', () => {
      const snapped = snapToPolyline(17.05, 78.101, polyline);
      assert.equal(snapped.segmentIndex, 1);
      assert.ok(snapped.linearDistanceKm > 14.0);
      assert.ok(snapped.distanceToPolylineMeters < 150);
    });
  });

  describe('evaluateVehicleProgress', () => {
    const mockManifest: RouteManifest = {
      routeId: '11111111-1111-1111-1111-111111111111',
      routeNumber: 'R-101',
      name: 'Sector 1 Express',
      totalDistanceKm: 15.0,
      estimatedDurationMinutes: 30,
      polylineCoordinates: [
        [78.0, 17.0],
        [78.05, 17.0],
        [78.1, 17.0],
      ],
      stops: [
        {
          id: 'rs-1',
          stopId: 'stop-1',
          name: 'Campus Main Gate',
          code: 'STOP-101',
          stopOrder: 1,
          latitude: 17.0,
          longitude: 78.0,
          estimatedMinutesFromStart: 0,
          distanceFromOriginKm: 0.0,
          geofenceRadiusMeters: 50,
        },
        {
          id: 'rs-2',
          stopId: 'stop-2',
          name: 'Transit Junction #2',
          code: 'STOP-102',
          stopOrder: 2,
          latitude: 17.0,
          longitude: 78.05,
          estimatedMinutesFromStart: 12,
          distanceFromOriginKm: 5.3,
          geofenceRadiusMeters: 50,
        },
        {
          id: 'rs-3',
          stopId: 'stop-3',
          name: 'Central Hostels Terminal',
          code: 'STOP-103',
          stopOrder: 3,
          latitude: 17.0,
          longitude: 78.1,
          estimatedMinutesFromStart: 25,
          distanceFromOriginKm: 10.6,
          geofenceRadiusMeters: 60,
        },
      ],
    };

    it('should detect AT_STOP when vehicle is parked at Stop 1 (Main Gate)', async () => {
      const ping: TelemetryPing = {
        busId: 'BUS-101',
        routeId: mockManifest.routeId,
        latitude: 17.0001, // ~11 meters from stop 1
        longitude: 78.0001,
        speed: 0,
        heading: 90,
        accuracy: 5,
        passengerCount: 20,
        status: 'ACTIVE',
        timestamp: Date.now(),
      };

      const progress = await evaluateVehicleProgress(ping, mockManifest);
      assert.ok(progress !== null);
      assert.equal(progress.currentStopOrder, 1);
      assert.equal(progress.window?.currentStop.stopId, 'stop-1');
      assert.equal(progress.window?.currentStop.status, 'AT_STOP');
      assert.equal(progress.window?.currentStop.etaSeconds, 0);
      assert.equal(progress.window?.busPosition, 'TOP');
      assert.equal(progress.window?.previousStop, null);
      assert.equal(progress.window?.nextStop?.name, 'Transit Junction #2');
    });

    it('should detect APPROACHING when vehicle is within 400m of Stop 2', async () => {
      // 0.002 degrees longitude ~ 210 meters from Stop 2 (78.05, 17.0)
      const ping: TelemetryPing = {
        busId: 'BUS-101',
        routeId: mockManifest.routeId,
        latitude: 17.0,
        longitude: 78.048,
        speed: 30, // 30 km/h
        heading: 90,
        accuracy: 5,
        passengerCount: 20,
        status: 'ACTIVE',
        timestamp: Date.now(),
      };

      const progress = await evaluateVehicleProgress(ping, mockManifest);
      assert.ok(progress !== null);
      assert.equal(progress.window?.currentStop.name, 'Transit Junction #2');
      assert.equal(progress.window?.currentStop.status, 'APPROACHING');
      assert.ok((progress.window?.currentStop.distanceMeters ?? 0) <= 400);
      assert.ok((progress.window?.currentStop.etaSeconds ?? 0) > 0 && (progress.window?.currentStop.etaSeconds ?? 0) <= 60);
      assert.equal(progress.window?.busPosition, 'MIDDLE');
      assert.equal(progress.window?.previousStop?.name, 'Campus Main Gate');
      assert.equal(progress.window?.nextStop?.name, 'Central Hostels Terminal');
    });

    it('should detect EN_ROUTE when vehicle is cruising between Stop 1 and Stop 2 (>400m away)', async () => {
      const ping: TelemetryPing = {
        busId: 'BUS-101',
        routeId: mockManifest.routeId,
        latitude: 17.0,
        longitude: 78.02, // ~3.1 km away from Stop 2
        speed: 40,
        heading: 90,
        accuracy: 5,
        passengerCount: 20,
        status: 'ACTIVE',
        timestamp: Date.now(),
      };

      const progress = await evaluateVehicleProgress(ping, mockManifest);
      assert.ok(progress !== null);
      assert.equal(progress.window?.currentStop.name, 'Transit Junction #2');
      assert.equal(progress.window?.currentStop.status, 'EN_ROUTE');
      assert.ok((progress.window?.currentStop.distanceMeters ?? 0) > 400);
      assert.ok(progress.progressPercent > 10 && progress.progressPercent < 40);
    });
  });

  describe('Off-Route Detour State Machine (Sprint 18)', () => {
    const testBusId = 'BUS-DETOUR-TEST';

    beforeEach(() => {
      _resetDetourMemoryStore();
    });

    it('should stay nominal when vehicle deviation is within normal corridor (<=150m)', async () => {
      const res = await evaluateVehicleDetour(testBusId, 45, 100000);
      assert.equal(res.isOffRoute, false);
      assert.equal(res.deviationMeters, 45);
    });

    it('should not trigger detour immediately when divergence > 300m for under 45 seconds', async () => {
      const startTime = 1000000;
      // Ping 1 at T=0
      const ping1 = await evaluateVehicleDetour(testBusId, 380, startTime);
      assert.equal(ping1.isOffRoute, false);

      // Ping 2 at T=30s (still under 45s)
      const ping2 = await evaluateVehicleDetour(testBusId, 420, startTime + 30000);
      assert.equal(ping2.isOffRoute, false);
    });

    it('should trip DETOUR alert when divergence > 300m is sustained for >= 45 seconds', async () => {
      const startTime = 1000000;
      await evaluateVehicleDetour(testBusId, 400, startTime);
      const sustained = await evaluateVehicleDetour(testBusId, 410, startTime + 45000);
      assert.equal(sustained.isOffRoute, true);
      assert.equal(sustained.deviationMeters, 410);
    });

    it('should maintain DETOUR during hysteresis zone (150m < deviation <= 300m)', async () => {
      const startTime = 1000000;
      // Trigger detour at 45s
      await evaluateVehicleDetour(testBusId, 400, startTime);
      await evaluateVehicleDetour(testBusId, 400, startTime + 45000);

      // Vehicle moves closer to corridor (220m away - inside hysteresis zone)
      const hysteresisPing = await evaluateVehicleDetour(testBusId, 220, startTime + 60000);
      assert.equal(hysteresisPing.isOffRoute, true);
    });

    it('should auto-recover from DETOUR only when vehicle returns within 150m corridor', async () => {
      const startTime = 1000000;
      // Trigger detour
      await evaluateVehicleDetour(testBusId, 450, startTime);
      await evaluateVehicleDetour(testBusId, 450, startTime + 45000);

      // Vehicle recovers within 150m boundary (e.g. 110m)
      const recovered = await evaluateVehicleDetour(testBusId, 110, startTime + 70000);
      assert.equal(recovered.isOffRoute, false);
      assert.equal(recovered.deviationMeters, 110);
    });

    it('should pause stop arrival ETAs in evaluateVehicleProgress when vehicle is off-route', async () => {
      const mockManifest: RouteManifest = {
        routeId: '22222222-2222-2222-2222-222222222222',
        routeNumber: 'R-202',
        name: 'Express Detour Test Route',
        totalDistanceKm: 10.0,
        estimatedDurationMinutes: 20,
        polylineCoordinates: [
          [78.0, 17.0],
          [78.05, 17.0],
          [78.1, 17.0],
        ],
        stops: [
          {
            id: 'rs-1',
            stopId: 'stop-1',
            name: 'Campus Main Gate',
            code: 'STOP-101',
            stopOrder: 1,
            latitude: 17.0,
            longitude: 78.0,
            estimatedMinutesFromStart: 0,
            distanceFromOriginKm: 0.0,
            geofenceRadiusMeters: 50,
          },
          {
            id: 'rs-2',
            stopId: 'stop-2',
            name: 'Transit Junction #2',
            code: 'STOP-102',
            stopOrder: 2,
            latitude: 17.0,
            longitude: 78.05,
            estimatedMinutesFromStart: 10,
            distanceFromOriginKm: 5.0,
            geofenceRadiusMeters: 50,
          },
        ],
      };

      const startTime = 2000000;
      // Ping vehicle 600m off corridor (0.005 deg lat offset ~ 550m)
      const offCorridorPing: TelemetryPing = {
        busId: testBusId,
        routeId: mockManifest.routeId,
        latitude: 17.005, // ~550m north of route polyline at lat 17.0
        longitude: 78.02,
        speed: 35,
        heading: 90,
        accuracy: 5,
        passengerCount: 15,
        status: 'ACTIVE',
        timestamp: startTime,
      };

      // T=0 ping (divergence initiated)
      const prog1 = await evaluateVehicleProgress(offCorridorPing, mockManifest);
      assert.ok(prog1 !== null);
      assert.equal(prog1.isOffRoute, false);
      assert.ok(prog1.window?.currentStop.etaSeconds !== undefined);

      // T=46s ping (sustained off-route detour confirmed)
      const sustainedPing: TelemetryPing = {
        ...offCorridorPing,
        timestamp: startTime + 46000,
      };
      const prog2 = await evaluateVehicleProgress(sustainedPing, mockManifest);
      assert.ok(prog2 !== null);
      assert.equal(prog2.isOffRoute, true);
      assert.ok(prog2.deviationMeters! > 300);
      // ETA must be paused (undefined)
      assert.equal(prog2.window?.currentStop.etaSeconds, undefined);
    });

    it('should clear detour state and progress cache when clearVehicleProgress is invoked', async () => {
      const startTime = 3000000;
      await evaluateVehicleDetour(testBusId, 450, startTime);
      await evaluateVehicleDetour(testBusId, 450, startTime + 45000);

      // Verify active detour
      const active = await evaluateVehicleDetour(testBusId, 250, startTime + 50000);
      assert.equal(active.isOffRoute, true);

      // Invoke clearVehicleProgress
      await clearVehicleProgress(testBusId);

      // After clearing, a ping in hysteresis zone (250m) should evaluate as nominal (false) since previous state was cleared
      const resetPing = await evaluateVehicleDetour(testBusId, 250, startTime + 60000);
      assert.equal(resetPing.isOffRoute, false);
    });
  });
});
