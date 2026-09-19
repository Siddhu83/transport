import { z } from 'zod';
import { Role } from '@prisma/client';
export const LoginSchema = z.object({
    email: z.string().email('Invalid email address format'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
});
export const RegisterUserSchema = z.object({
    email: z.string().email('Invalid email address format'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    name: z.string().min(2, 'Name must be at least 2 characters long'),
    role: z.nativeEnum(Role).default(Role.STUDENT),
    assignedBusId: z.string().uuid().optional(),
    assignedRouteId: z.string().uuid().optional(),
});
