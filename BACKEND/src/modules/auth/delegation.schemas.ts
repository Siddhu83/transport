import { z } from 'zod';

export const CreateDelegationSchema = z.object({
  delegateName: z.string().min(2, 'Delegate name must be at least 2 characters').max(100).optional(),
  delegatePhone: z.string().min(10, 'Delegate phone must be at least 10 digits').max(15).optional(),
  durationHours: z.number().int().min(1, 'Minimum duration is 1 hour').max(4, 'Maximum duration is 4 hours').default(4),
  note: z.string().max(250, 'Note cannot exceed 250 characters').optional(),
});

export const ClaimDelegationSchema = z.object({
  ticketId: z.string().min(10, 'Invalid ticket identifier format'),
});

export const RevokeDelegationSchema = z.object({
  jti: z.string().optional(),
});

export type CreateDelegationInput = z.infer<typeof CreateDelegationSchema>;
export type ClaimDelegationInput = z.infer<typeof ClaimDelegationSchema>;
export type RevokeDelegationInput = z.infer<typeof RevokeDelegationSchema>;

export interface DelegationTicketData {
  ticketId: string;
  parentDriverId: string;
  parentDriverName: string;
  busId: string;
  routeId: string;
  delegateName?: string;
  delegatePhone?: string;
  durationHours: number;
  note?: string;
  createdAt: number;
  expiresAt: number;
}

export interface DelegationSessionData {
  jti: string;
  ticketId: string;
  parentDriverId: string;
  parentDriverName: string;
  busId: string;
  routeId: string;
  delegateName: string;
  claimedAt: number;
  expiresAt: number;
}
