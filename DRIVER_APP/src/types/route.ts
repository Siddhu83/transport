export type StopProgressStatus = 'EN_ROUTE' | 'APPROACHING' | 'AT_STOP' | 'DEPARTED';

export interface ManifestStop {
  id: string;
  stopId: string;
  name: string;
  code: string;
  stopOrder: number;
  latitude: number;
  longitude: number;
  estimatedMinutesFromStart: number;
  distanceFromOriginKm: number;
  geofenceRadiusMeters: number;
}

export interface RouteManifest {
  routeId: string;
  routeNumber: string;
  name: string;
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  stops: ManifestStop[];
  polylineCoordinates: [number, number][];
}

export interface VehicleRouteProgress {
  busId: string;
  routeId: string;
  currentStopOrder: number;
  nextStopId: string;
  nextStopName: string;
  distanceToNextStopMeters: number;
  etaSeconds: number;
  status: StopProgressStatus;
  linearDistanceCoveredKm: number;
  totalRouteDistanceKm: number;
  progressPercent: number;
  updatedAt: number;
}
