import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../infrastructure/prisma.js';
import { hashPassword } from '../crypto.utils.js';
import { Role } from '@prisma/client';

describe('Auth & RBAC Middleware Integration Tests', () => {
  const app = buildApp();
  let adminToken: string;
  let driverToken: string;
  let studentToken: string;

  before(async () => {
    await app.ready();

    // Clean test user entries
    await prisma.user.deleteMany({
      where: { email: { in: ['testadmin@college.edu', 'testdriver@college.edu', 'teststudent@college.edu'] } },
    });

    const passwordHash = await hashPassword('Password123!');

    // Create test accounts
    const admin = await prisma.user.create({
      data: {
        email: 'testadmin@college.edu',
        passwordHash,
        name: 'Test Admin',
        role: Role.SUPER_ADMIN,
      },
    });

    const driver = await prisma.user.create({
      data: {
        email: 'testdriver@college.edu',
        passwordHash,
        name: 'Test Driver',
        role: Role.DRIVER,
      },
    });

    const student = await prisma.user.create({
      data: {
        email: 'teststudent@college.edu',
        passwordHash,
        name: 'Test Student',
        role: Role.STUDENT,
      },
    });

    // Generate JWT tokens for testing
    adminToken = app.jwt.sign({ userId: admin.id, email: admin.email, role: admin.role });
    driverToken = app.jwt.sign({ userId: driver.id, email: driver.email, role: driver.role });
    studentToken = app.jwt.sign({ userId: student.id, email: student.email, role: student.role });
  });

  after(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['testadmin@college.edu', 'testdriver@college.edu', 'teststudent@college.edu'] } },
    });
    await app.close();
  });

  test('POST /api/v1/auth/login with valid credentials returns 200 and token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'testadmin@college.edu',
        password: 'Password123!',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.statusCode, 200);
    assert.ok(body.token);
    assert.equal(body.user.role, 'SUPER_ADMIN');
  });

  test('POST /api/v1/auth/login with invalid password returns 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'testadmin@college.edu',
        password: 'WrongPassword!',
      },
    });

    assert.equal(res.statusCode, 401);
  });

  test('GET /api/v1/auth/me without token returns 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    assert.equal(res.statusCode, 401);
  });

  test('GET /api/v1/auth/me with valid bearer token returns 200 and user claims', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.user.email, 'testadmin@college.edu');
    assert.equal(body.user.role, 'SUPER_ADMIN');
  });

  test('POST /api/v1/auth/register with STUDENT or DRIVER token returns 403 Forbidden', async () => {
    const resStudent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { authorization: `Bearer ${studentToken}` },
      payload: { email: 'newuser1@college.edu', password: 'Password123!', name: 'New User 1', role: 'STUDENT' },
    });
    assert.equal(resStudent.statusCode, 403);

    const resDriver = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { authorization: `Bearer ${driverToken}` },
      payload: { email: 'newuser2@college.edu', password: 'Password123!', name: 'New User 2', role: 'STUDENT' },
    });
    assert.equal(resDriver.statusCode, 403);
  });

  test('POST /api/v1/auth/register with SUPER_ADMIN token creates user and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        email: 'createduser@college.edu',
        password: 'Password123!',
        name: 'Created User',
        role: 'STUDENT',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.user.email, 'createduser@college.edu');

    // Clean up created test user
    await prisma.user.delete({ where: { email: 'createduser@college.edu' } });
  });
});
