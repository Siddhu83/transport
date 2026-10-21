import { z } from 'zod';
import { PassengerBand, SosReason, SosIncidentStatus } from '@prisma/client';

export const SosTriggerSchema = z.object({
  busId: z.string().uuid({ message: 'busId must be a valid UUID' }),
  routeId: z.string().uuid({ message: 'routeId must be a valid UUID' }),
  latitude: z.number().min(-90).max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z.number().min(-180).max(180, { message: 'Longitude must be between -180 and 180' }),
  strandedPassengerBand: z.nativeEnum(PassengerBand, {
    errorMap: () => ({ message: 'Invalid stranded passenger band' }),
  }),
  reason: z.nativeEnum(SosReason, {
    errorMap: () => ({ message: 'Invalid breakdown reason' }),
  }),
  notes: z.string().max(255).optional(),
});

export type SosTriggerPayload = z.infer<typeof SosTriggerSchema>;

export const SosAcknowledgeSchema = z.object({
  notes: z.string().max(255).optional(),
});

export const SosDispatchSchema = z.object({
  reliefBusId: z.string().uuid({ message: 'reliefBusId must be a valid UUID' }),
  notes: z.string().max(255).optional(),
});

export const SosResolveSchema = z.object({
  resolutionNotes: z.string().max(255).optional(),
});

export interface CandidateBus {
  busId: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  routeId: string;
  speed: number;
  driverName?: string;
  busNumber?: string;
}

export interface SosIncidentResponse {
  incidentId: string;
  status: SosIncidentStatus;
  busId: string;
  routeId: string;
  driverId: string;
  strandedPassengerBand: PassengerBand;
  reason: SosReason;
  notes?: string | null;
  reliefBusId?: string | null;
  ackByAdmin: boolean;
  createdAt: string;
  resolvedAt?: string | null;
}
