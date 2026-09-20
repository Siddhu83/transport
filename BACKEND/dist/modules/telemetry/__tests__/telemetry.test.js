import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../../app.js';
import { redis } from '../../../infrastructure/redis.js';
import { Role } from '@prisma/client';
describe('High-Frequency Telemetry Ingestion Integration Tests', () => {
    const app = buildApp();
    const testBusId = randomUUID();
    const unassignedBusId = randomUUID();
    const testRouteId = randomUUID();
    let driverToken;
    before(async () => {
        await app.ready();
        // Generate driver JWT token bound to testBusId
        driverToken = app.jwt.sign({
            userId: randomUUID(),
            email: 'telemetrydriver@college.edu',
            role: Role.DRIVER,
            assignedBusId: testBusId,
            assignedRouteId: testRouteId,
        });
    });
    after(async () => {
        // Clean up test keys from Redis
        await redis.del('buses:live');
        await redis.del(`bus:${testBusId}:state`);
        await app.close();
    });
    test('POST /api/v1/telemetry/ping with valid payload populates Redis in-memory spatial index and hash', async () => {
        const pingPayload = {
            busId: testBusId,
            routeId: testRouteId,
            latitude: 17.4435,
            longitude: 78.3489,
            speed: 34.5,
            heading: 180,
            accuracy: 5,
            timestamp: Date.now(),
        };
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/telemetry/ping',
            headers: {
                authorization: `Bearer ${driverToken}`,
            },
            payload: pingPayload,
        });
        assert.equal(res.statusCode, 200);
        // Verify Redis Hash State
        const busState = await redis.hgetall(`bus:${testBusId}:state`);
        assert.equal(busState.routeId, testRouteId);
        assert.equal(busState.speed, '34.5');
        assert.equal(busState.heading, '180');
        assert.equal(busState.status, 'ACTIVE');
        // Verify Redis Key TTL (capped at 30 seconds)
        const ttl = await redis.ttl(`bus:${testBusId}:state`);
        assert.ok(ttl > 0 && ttl <= 30);
        // Verify Redis Spatial Position
        const pos = await redis.geopos('buses:live', testBusId);
        assert.ok(pos && pos[0] && pos[0][0] !== null);
        assert.equal(parseFloat(pos[0][0]).toFixed(4), '78.3489');
        assert.equal(parseFloat(pos[0][1]).toFixed(4), '17.4435');
    });
    test('POST /api/v1/telemetry/ping for unassigned vehicle returns 403 Forbidden', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/telemetry/ping',
            headers: {
                authorization: `Bearer ${driverToken}`,
            },
            payload: {
                busId: unassignedBusId,
                routeId: testRouteId,
                latitude: 17.4435,
                longitude: 78.3489,
                speed: 20,
                heading: 90,
                accuracy: 5,
                timestamp: Date.now(),
            },
        });
        assert.equal(res.statusCode, 403);
    });
    test('POST /api/v1/telemetry/ping with low accuracy (>35m) returns 204 No Content', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/telemetry/ping',
            headers: {
                authorization: `Bearer ${driverToken}`,
            },
            payload: {
                busId: testBusId,
                routeId: testRouteId,
                latitude: 17.4435,
                longitude: 78.3489,
                speed: 20,
                heading: 90,
                accuracy: 45, // > 35m accuracy drops coordinate
                timestamp: Date.now(),
            },
        });
        assert.equal(res.statusCode, 204);
    });
    test('POST /api/v1/telemetry/ping with clock drift (>60s) returns 400 Bad Request', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/telemetry/ping',
            headers: {
                authorization: `Bearer ${driverToken}`,
            },
            payload: {
                busId: testBusId,
                routeId: testRouteId,
                latitude: 17.4435,
                longitude: 78.3489,
                speed: 20,
                heading: 90,
                accuracy: 5,
                timestamp: Date.now() - 75000, // 75s old (clock drift)
            },
        });
        assert.equal(res.statusCode, 400);
    });
});
