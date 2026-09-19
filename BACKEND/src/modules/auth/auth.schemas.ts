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

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

export interface TokenPayload {
  userId: string;
  email: string;
  role: Role;
  assignedBusId?: string | null;
  assignedRouteId?: string | null;
}

// Declaration merging for Fastify JWT request user object
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}
