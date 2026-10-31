import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../../app.js';
import { redis } from '../../../infrastructure/redis.js';

describe('Shift Continuity & Ephemeral Delegation Engine (Sprint 16)', () => {
  const app = buildApp();
  const testDriverId = randomUUID();
  const testBusId = randomUUID();
  const testRouteId = randomUUID();

  let driverToken: string;
  let createdTicketId: string;
  let delegatedToken: string;
  let delegatedJti: string;

  before(async () => {
    await app.ready();

    // Generate authenticated test Driver JWT
    driverToken = app.jwt.sign({
      userId: testDriverId,
      email: 'captain.raju@transport.college.edu',
      name: 'Captain Raju',
      role: 'DRIVER',
      assignedBusId: testBusId,
      assignedRouteId: testRouteId,
    });
  });

  after(async () => {
    // Cleanup any test delegation keys in Redis if connected
    if (redis.status === 'ready' || redis.status === 'connect') {
      try {
        if (createdTicketId) {
          await redis.del(`delegation:ticket:${createdTicketId}`);
        }
        if (delegatedJti) {
          await redis.del(`delegation:session:${delegatedJti}`);
          await redis.del(`delegation:revoked:${delegatedJti}`);
        }
        await redis.del(`delegation:active_for_driver:${testDriverId}`);
        await redis.del(`delegation:driver_pending:${testDriverId}`);
      } catch {}
    }

    await app.close();
    redis.disconnect();
  });

  it('POST /api/v1/auth/delegation/create generates 15-minute single-use ticket', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/delegation/create',
      headers: {
        authorization: `Bearer ${driverToken}`,
      },
      payload: {
        delegateName: 'Vamsi (Student Bus Rep)',
        delegatePhone: '9876543210',
        durationHours: 4,
        note: 'Driver on medical leave for morning corridor shift',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.statusCode, 201);
    assert.ok(body.ticket.ticketId.startsWith('del_'));
    assert.ok(body.ticket.qrData.startsWith('ATS:DELEGATE:del_'));
    assert.ok(body.ticket.expiresAt > Date.now());

    createdTicketId = body.ticket.ticketId;

    // Check active status endpoint
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/delegation/active',
      headers: {
        authorization: `Bearer ${driverToken}`,
      },
    });
    assert.equal(statusRes.statusCode, 200);
    const statusBody = JSON.parse(statusRes.body);
    assert.equal(statusBody.pendingTicket?.ticketId, createdTicketId);
  });

  it('POST /api/v1/auth/delegation/claim redeems ticket and issues 4-hour DELEGATED_DRIVER session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/delegation/claim',
      payload: {
        ticketId: createdTicketId,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.statusCode, 200);
    assert.ok(body.token);
    assert.equal(body.session.role, 'DELEGATED_DRIVER');
    assert.equal(body.session.busId, testBusId);
    assert.equal(body.session.parentDriverId, testDriverId);
    assert.equal(body.session.parentDriverName, 'Captain Raju');
    assert.equal(body.session.delegateName, 'Vamsi (Student Bus Rep)');
    assert.ok(body.session.jti.startsWith('dsess_'));

    delegatedToken = body.token;
    delegatedJti = body.session.jti;
  });

  it('Anti-Replay: Claiming the same delegation ticket a second time returns 410 Gone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/delegation/claim',
      payload: {
        ticketId: createdTicketId,
      },
    });

    assert.equal(res.statusCode, 410);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'Gone');
    assert.ok(body.message.includes('already been redeemed') || body.message.includes('invalid'));
  });

  it('Delegated session can emit valid telemetry ping to ingestion pipeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry/ping',
      headers: {
        authorization: `Bearer ${delegatedToken}`,
      },
      payload: {
        busId: testBusId,
        latitude: 17.4455,
        longitude: 78.3489,
        speed: 28,
        heading: 90,
        accuracy: 4,
        timestamp: Date.now(),
        routeId: testRouteId,
      },
    });

    // Valid ping accepted (200 OK or 204)
    assert.ok(res.statusCode === 200 || res.statusCode === 204);
  });

  it('POST /api/v1/auth/delegation/revoke blacklists active session JTI in Redis', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/delegation/revoke',
      headers: {
        authorization: `Bearer ${driverToken}`,
      },
      payload: {
        jti: delegatedJti,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.revoked, true);
  });

  it('Subsequent telemetry ping from revoked delegated session is immediately rejected (401 Unauthorized)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telemetry/ping',
      headers: {
        authorization: `Bearer ${delegatedToken}`,
      },
      payload: {
        busId: testBusId,
        latitude: 17.4455,
        longitude: 78.3489,
        speed: 28,
        heading: 90,
        accuracy: 4,
        timestamp: Date.now(),
        routeId: testRouteId,
      },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.statusCode, 401);
    assert.ok(body.message.includes('revoked or expired'));
  });
});
