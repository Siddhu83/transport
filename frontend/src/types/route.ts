export type StopProgressStatus = 'EN_ROUTE' | 'APPROACHING' | 'AT_STOP' | 'DEPARTED';

export interface SlidingWindowStop {
  stopId: string;
  name: string;
  code: string;
  stopOrder: number;
  status: 'DEPARTED' | 'AT_STOP' | 'APPROACHING' | 'EN_ROUTE' | 'UPCOMING';
  distanceMeters?: number;
  etaSeconds?: number;
  timeLabel?: string;
  isOrigin?: boolean;
  isTerminus?: boolean;
}

export interface SlidingStopWindow {
  previousStop: SlidingWindowStop | null;
  currentStop: SlidingWindowStop;
  nextStop: SlidingWindowStop | null;
  totalStopsCount: number;
  busPosition: 'TOP' | 'MIDDLE' | 'BOTTOM';
}

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
  linearDistanceCoveredKm: number;
  totalRouteDistanceKm: number;
  progressPercent: number;
  window?: SlidingStopWindow;
  updatedAt: number;
}

