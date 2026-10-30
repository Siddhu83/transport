import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../../app.js';
import { redis } from '../../../infrastructure/redis.js';

describe('Route Management & Linear Manifest API (Sprint 14)', () => {
  const app = buildApp();
  const testRouteId = randomUUID();

  before(async () => {
    await app.ready();
  });

  after(async () => {
    await app.close();
    redis.disconnect();
  });

  it('GET /api/v1/routes returns route listing (200 or 503 if db offline)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/routes',
    });

    assert.ok(res.statusCode === 200 || res.statusCode === 503);
    const body = JSON.parse(res.body);
    if (res.statusCode === 200) {
      assert.ok(Array.isArray(body.data));
    }
  });

  it('GET /api/v1/routes/:id/manifest returns 404 for nonexistent route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/routes/${testRouteId}/manifest`,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.statusCode, 404);
    assert.ok(body.message.includes('not found'));
  });

  it('GET /api/v1/routes/:id/manifest returns 200 when manifest is cached in Redis', async () => {
    const cachedManifest = {
      routeId: testRouteId,
      routeNumber: 'R-999',
      name: 'Test Corridor Express',
      totalDistanceKm: 12.4,
      estimatedDurationMinutes: 35,
      stops: [
        {
          id: randomUUID(),
          stopId: randomUUID(),
          name: 'Terminal Alpha',
          code: 'STOP-001',
          stopOrder: 1,
          latitude: 17.44,
          longitude: 78.34,
          estimatedMinutesFromStart: 0,
          distanceFromOriginKm: 0.0,
          geofenceRadiusMeters: 50,
        },
      ],
      polylineCoordinates: [[78.34, 17.44], [78.36, 17.46]],
    };

    if (redis.status === 'ready' || redis.status === 'connect') {
      await redis.set(`route:${testRouteId}:manifest`, JSON.stringify(cachedManifest), 'EX', 60);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/routes/${testRouteId}/manifest`,
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.body);
      assert.equal(body.statusCode, 200);
      assert.equal(body.data.routeNumber, 'R-999');
      assert.equal(body.data.stops.length, 1);
      assert.equal(body.data.stops[0].name, 'Terminal Alpha');

      await redis.del(`route:${testRouteId}:manifest`);
    }
  });
});
