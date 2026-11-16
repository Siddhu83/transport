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
  linearDistanceCoveredKm: z.number().nonnegative(),
  totalRouteDistanceKm: z.number().nonnegative(),
  progressPercent: z.number().min(0).max(100),
  window: SlidingStopWindowSchema,
  updatedAt: z.number(),
  isOffRoute: z.boolean().optional(),
  deviationMeters: z.number().optional(),
});

export type VehicleRouteProgress = z.infer<typeof VehicleRouteProgressSchema>;

// Route & Stop Ingestion Schemas (Sprint 19)

export const StudioStopInputSchema = z.object({
  name: z.string().min(1, 'Stop name is required'),
  code: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geofenceRadiusMeters: z.number().int().positive().optional().default(50),
});

export type StudioStopInput = z.infer<typeof StudioStopInputSchema>;

export const CreateStudioRouteSchema = z.object({
  routeNumber: z.string().min(1, 'Route number is required'),
  name: z.string().min(1, 'Route name is required'),
  busId: z.string().uuid().or(z.string().min(1)).optional(),
  stops: z.array(StudioStopInputSchema).min(2, 'Route must have at least 2 stops'),
  polylineCoordinates: z.array(z.tuple([z.number(), z.number()])).optional(),
});

export type CreateStudioRouteInput = z.infer<typeof CreateStudioRouteSchema>;

export const ImportFileRouteSchema = z.object({
  fileContent: z.string().min(10, 'File content must not be empty'),
  fileType: z.enum(['kml', 'gpx']).optional(),
  routeNumber: z.string().optional(),
  name: z.string().optional(),
  busId: z.string().uuid().or(z.string().min(1)).optional(),
});

export type ImportFileRouteInput = z.infer<typeof ImportFileRouteSchema>;
