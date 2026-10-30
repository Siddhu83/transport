import { z } from 'zod';

export const StopProgressStatusSchema = z.enum([
  'EN_ROUTE',
  'APPROACHING',
  'AT_STOP',
  'DEPARTED',
]);

export type StopProgressStatus = z.infer<typeof StopProgressStatusSchema>;

export const ManifestStopSchema = z.object({
  id: z.string().uuid(),
  stopId: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  stopOrder: z.number().int().min(1),
  latitude: z.number(),
  longitude: z.number(),
  estimatedMinutesFromStart: z.number().int().nonnegative(),
  distanceFromOriginKm: z.number().nonnegative(),
  geofenceRadiusMeters: z.number().int().positive().default(50),
});

export type ManifestStop = z.infer<typeof ManifestStopSchema>;

export const RouteManifestSchema = z.object({
  routeId: z.string().uuid(),
  routeNumber: z.string(),
  name: z.string(),
  totalDistanceKm: z.number().nonnegative(),
  estimatedDurationMinutes: z.number().int().nonnegative(),
  stops: z.array(ManifestStopSchema),
  polylineCoordinates: z.array(z.tuple([z.number(), z.number()])), // [[lng, lat], ...]
});

export type RouteManifest = z.infer<typeof RouteManifestSchema>;

export const SlidingWindowStopSchema = z.object({
  stopId: z.string(),
  name: z.string(),
  code: z.string(),
  stopOrder: z.number().int(),
  status: z.enum(['DEPARTED', 'AT_STOP', 'APPROACHING', 'EN_ROUTE', 'UPCOMING']),
  distanceMeters: z.number().optional(),
  etaSeconds: z.number().optional(),
  timeLabel: z.string().optional(),
  isOrigin: z.boolean().optional(),
  isTerminus: z.boolean().optional(),
});

export type SlidingWindowStop = z.infer<typeof SlidingWindowStopSchema>;

export const SlidingStopWindowSchema = z.object({
  previousStop: SlidingWindowStopSchema.nullable(),
  currentStop: SlidingWindowStopSchema,
  nextStop: SlidingWindowStopSchema.nullable(),
  totalStopsCount: z.number().int(),
  busPosition: z.enum(['TOP', 'MIDDLE', 'BOTTOM']),
});

export type SlidingStopWindow = z.infer<typeof SlidingStopWindowSchema>;

export const VehicleRouteProgressSchema = z.object({
  busId: z.string(),
  routeId: z.string(),
  currentStopOrder: z.number().int(),
  nextStopId: z.string(),
  nextStopName: z.string(),
  distanceToNextStopMeters: z.number().nonnegative(),
  etaSeconds: z.number().int().nonnegative(),
  status: StopProgressStatusSchema,
  linearDistanceCoveredKm: z.number().nonnegative(),
  totalRouteDistanceKm: z.number().nonnegative(),
  progressPercent: z.number().min(0).max(100),
  window: SlidingStopWindowSchema.optional(),
  updatedAt: z.number(),
});

export type VehicleRouteProgress = z.infer<typeof VehicleRouteProgressSchema>;
