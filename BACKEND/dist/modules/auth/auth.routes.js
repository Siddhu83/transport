import { prisma } from '../../infrastructure/prisma.js';
import { LoginSchema, RegisterUserSchema } from './auth.schemas.js';
import { hashPassword, verifyPassword } from './crypto.utils.js';
import { authenticate, requireRoles } from './rbac.middleware.js';
import { Role } from '@prisma/client';
export async function authRoutes(fastify) {
    /**
     * POST /api/v1/auth/login
     * Authenticates user and issues JWT signed token with role claims
     */
    fastify.post('/login', async (request, reply) => {
        const parseResult = LoginSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Invalid input payload',
                details: parseResult.error.format(),
            });
        }
        const { email, password } = parseResult.data;
        // Fetch user with assigned relationships
        const user = await prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Invalid email or password',
            });
        }
        const isPasswordValid = await verifyPassword(password, user.passwordHash);
        if (!isPasswordValid) {
            return reply.code(401).send({
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Invalid email or password',
            });
        }
        // Sign JWT token
        const token = fastify.jwt.sign({
            userId: user.id,
            email: user.email,
            role: user.role,
            assignedBusId: user.assignedBusId,
            assignedRouteId: user.assignedRouteId,
        });
        return reply.code(200).send({
            statusCode: 200,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                assignedBusId: user.assignedBusId,
                assignedRouteId: user.assignedRouteId,
            },
        });
    });
    /**
     * POST /api/v1/auth/register
     * Restricted to SUPER_ADMIN role for creating platform accounts
     */
    fastify.post('/register', { preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)] }, async (request, reply) => {
        const parseResult = RegisterUserSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Invalid registration payload',
                details: parseResult.error.format(),
            });
        }
        const { email, password, name, role, assignedBusId, assignedRouteId } = parseResult.data;
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: 'User with this email already exists',
            });
        }
        const passwordHash = await hashPassword(password);
        const newUser = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name,
                role,
                assignedBusId,
                assignedRouteId,
            },
        });
        return reply.code(210).send({
            statusCode: 201,
            message: 'User created successfully',
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role,
                assignedBusId: newUser.assignedBusId,
                assignedRouteId: newUser.assignedRouteId,
            },
        });
    });
    /**
     * GET /api/v1/auth/me
     * Returns details of currently authenticated user token holder
     */
    fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
        const user = await prisma.user.findUnique({
            where: { id: request.user.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                assignedBusId: true,
                assignedRouteId: true,
                createdAt: true,
            },
        });
        if (!user) {
            return reply.code(404).send({
                statusCode: 404,
                error: 'Not Found',
                message: 'User account not found',
            });
        }
        return reply.code(200).send({
            statusCode: 200,
            user,
        });
    });
}
