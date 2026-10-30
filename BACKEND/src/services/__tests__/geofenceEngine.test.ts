import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { projectPointToSegment, snapToPolyline, evaluateVehicleProgress } from '../geofenceEngine.js';
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
      assert.equal(progress.nextStopId, 'stop-1');
      assert.equal(progress.status, 'AT_STOP');
      assert.equal(progress.etaSeconds, 0);
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
      assert.equal(progress.nextStopName, 'Transit Junction #2');
      assert.equal(progress.status, 'APPROACHING');
      assert.ok(progress.distanceToNextStopMeters <= 400);
      assert.ok(progress.etaSeconds > 0 && progress.etaSeconds <= 60);
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
      assert.equal(progress.nextStopName, 'Transit Junction #2');
      assert.equal(progress.status, 'EN_ROUTE');
      assert.ok(progress.distanceToNextStopMeters > 400);
      assert.ok(progress.progressPercent > 10 && progress.progressPercent < 40);
    });
  });
});
