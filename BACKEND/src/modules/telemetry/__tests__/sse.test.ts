import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { buildApp } from '../../../app.js';
import { redis } from '../../../infrastructure/redis.js';
import { sseHub } from '../sseHub.js';
import { Role } from '@prisma/client';

describe('Real-Time Server-Sent Events (SSE) Stream Integration Tests', () => {
  const app = buildApp();
  const testPort = 8089;
  const testBusId = randomUUID();
  const testRouteId = randomUUID();

  let driverToken: string;

  before(async () => {
    await app.listen({ port: testPort, host: '127.0.0.1' });

    driverToken = app.jwt.sign({
      userId: randomUUID(),
      email: 'ssedriver@college.edu',
      role: Role.DRIVER,
      assignedBusId: testBusId,
      assignedRouteId: testRouteId,
    });
  });

  after(async () => {
    await redis.del('buses:live');
    await redis.del(`bus:${testBusId}:state`);
    sseHub.close();
    await app.close();
  });

  test('GET /api/v1/telemetry/stream connects and receives SSE heartbeat and fleet snapshot frames', async () => {
    return new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${testPort}/api/v1/telemetry/stream`, async (res) => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['content-type'], 'text/event-stream');

        let dataBuffer = '';

        res.on('data', (chunk) => {
          dataBuffer += chunk.toString();

          // Verify initial heartbeat frame
          if (dataBuffer.includes(': heartbeat') && !dataBuffer.includes('fleet-snapshot')) {
            // Now emit a telemetry ping to trigger 500ms snapshot flush
            app.inject({
              method: 'POST',
              url: '/api/v1/telemetry/ping',
              headers: { authorization: `Bearer ${driverToken}` },
              payload: {
                busId: testBusId,
                routeId: testRouteId,
                latitude: 17.4435,
                longitude: 78.3489,
                speed: 40,
                heading: 120,
                accuracy: 5,
                timestamp: Date.now(),
              },
            });
          }

          // Verify fleet-snapshot frame
          if (dataBuffer.includes('event: fleet-snapshot')) {
            const lines = dataBuffer.split('\n');
            const dataLine = lines.find((l) => l.startsWith('data: '));
            assert.ok(dataLine);

            const featureCollection = JSON.parse(dataLine.replace('data: ', ''));
            assert.equal(featureCollection.type, 'FeatureCollection');
            assert.ok(Array.isArray(featureCollection.features));
            assert.equal(featureCollection.features.length, 1);
            assert.equal(featureCollection.features[0].properties.busId, testBusId);

            req.destroy();
            resolve();
          }
        });

        res.on('error', (err) => reject(err));
      });

      req.on('error', (err) => reject(err));
    });
  });

  test('GET /api/v1/telemetry/stream disconnect unregisters client from SSE Hub', async () => {
    const initialClients = sseHub.getClientCount();

    return new Promise<void>((resolve) => {
      const req = http.get(`http://127.0.0.1:${testPort}/api/v1/telemetry/stream`, (res) => {
        assert.equal(res.statusCode, 200);

        // Client registered
        setTimeout(() => {
          assert.equal(sseHub.getClientCount(), initialClients + 1);

          // Disconnect client socket
          req.destroy();

          setTimeout(() => {
            // Client unregistered
            assert.equal(sseHub.getClientCount(), initialClients);
            resolve();
          }, 100);
        }, 100);
      });

      req.on('error', () => {
        // Destroyed socket throws ECONNRESET, which is expected
      });
    });
  });
});
