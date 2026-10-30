import { redis } from '../infrastructure/redis.js';
import { getRouteManifest, haversineKm } from '../modules/routes/routes.service.js';
import { RouteManifest, VehicleRouteProgress, StopProgressStatus } from '../modules/routes/routes.schemas.js';
import { TelemetryPing } from '../modules/telemetry/telemetry.schemas.js';

export interface SnappedPoint {
  latitude: number;
  longitude: number;
  segmentIndex: number;
  linearDistanceKm: number;
  distanceToPolylineMeters: number;
}

/**
 * Projects a point (lat, lng) onto a line segment (A -> B).
 * Uses equirectangular approximation for high performance in microsecond telemetry loops.
 */
export function projectPointToSegment(
  lat: number,
  lng: number,
  latA: number,
  lngA: number,
  latB: number,
  lngB: number
): { t: number; projLat: number; projLng: number } {
  const midLat = ((latA + latB) / 2) * (Math.PI / 180);
  const cosMidLat = Math.cos(midLat);

  // Convert angular offsets to local Cartesian relative coordinates
  const x = (lng - lngA) * cosMidLat;
  const y = lat - latA;
  const dx = (lngB - lngA) * cosMidLat;
  const dy = latB - latA;

  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return { t: 0, projLat: latA, projLng: lngA };
  }

  // Scalar projection clamped to segment [0, 1]
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / lenSq));
  const projLat = latA + t * (latB - latA);
  const projLng = lngA + t * (lngB - lngA);

  return { t, projLat, projLng };
}

/**
 * Snaps a vehicle coordinate to the nearest point on a route polyline
 * and computes the cumulative linear distance covered from the origin.
 */
export function snapToPolyline(
  lat: number,
  lng: number,
  polylineCoords: [number, number][] // [[lng, lat], ...]
): SnappedPoint {
  if (polylineCoords.length === 0) {
    return {
      latitude: lat,
      longitude: lng,
      segmentIndex: 0,
      linearDistanceKm: 0,
      distanceToPolylineMeters: 0,
    };
  }

  if (polylineCoords.length === 1) {
    const [pLng, pLat] = polylineCoords[0]!;
    const distM = haversineKm(lat, lng, pLat, pLng) * 1000;
    return {
      latitude: pLat,
      longitude: pLng,
      segmentIndex: 0,
      linearDistanceKm: 0,
      distanceToPolylineMeters: distM,
    };
  }

  let minDistanceM = Infinity;
  let bestProjLat = lat;
  let bestProjLng = lng;
  let bestSegmentIndex = 0;
  let distanceAtBestSegmentOriginKm = 0;
  let cumulativeDistanceKm = 0;
  let bestSegmentT = 0;
  let bestSegmentLengthKm = 0;

  for (let i = 0; i < polylineCoords.length - 1; i++) {
    const [lngA, latA] = polylineCoords[i]!;
    const [lngB, latB] = polylineCoords[i + 1]!;
    const segmentLengthKm = haversineKm(latA, lngA, latB, lngB);

    const { t, projLat, projLng } = projectPointToSegment(lat, lng, latA, lngA, latB, lngB);
    const distToProjM = haversineKm(lat, lng, projLat, projLng) * 1000;

    if (distToProjM < minDistanceM) {
      minDistanceM = distToProjM;
      bestProjLat = projLat;
      bestProjLng = projLng;
      bestSegmentIndex = i;
      distanceAtBestSegmentOriginKm = cumulativeDistanceKm;
      bestSegmentT = t;
      bestSegmentLengthKm = segmentLengthKm;
    }

    cumulativeDistanceKm += segmentLengthKm;
  }

  const linearDistanceKm = Number(
    (distanceAtBestSegmentOriginKm + bestSegmentT * bestSegmentLengthKm).toFixed(2)
  );

  return {
    latitude: bestProjLat,
    longitude: bestProjLng,
    segmentIndex: bestSegmentIndex,
    linearDistanceKm,
    distanceToPolylineMeters: Math.round(minDistanceM),
  };
}

/**
 * 3-State Geofence and Real-time Stop Sequence Progress Engine.
 * Executes on telemetry pings without database access.
 */
export async function evaluateVehicleProgress(
  ping: TelemetryPing,
  explicitManifest?: RouteManifest | null
): Promise<VehicleRouteProgress | null> {
  const routeId = ping.routeId;
  if (!routeId || routeId === '00000000-0000-0000-0000-000000000000') {
    return null;
  }

  // 1. Fetch Route Manifest (reads through Redis cache)
  const manifest = explicitManifest !== undefined
    ? explicitManifest
    : await getRouteManifest(routeId);

  if (!manifest || manifest.stops.length === 0) {
    return null;
  }

  const { stops, polylineCoordinates, totalDistanceKm } = manifest;

  // 2. Spatial Map-Matching: Snap coordinate to polyline
  const snapped = snapToPolyline(ping.latitude, ping.longitude, polylineCoordinates);
  const busLinearKm = snapped.linearDistanceKm;

  // 3. Retrieve Previous Progress State from Redis (if any)
  let prevStopOrder = 0;
  if (redis.status === 'ready' || redis.status === 'connect') {
    try {
      const cached = await redis.hget(`bus:${ping.busId}:progress`, 'currentStopOrder');
      if (cached) {
        prevStopOrder = parseInt(cached, 10) || 0;
      }
    } catch {
      // Redis degradation fallback
    }
  }

  // 4. Evaluate Stop Geofences & Progression
  // Find which stop we are approaching, at, or past
  let currentStopOrder = 0;
  let nextStopIndex = 0;
  let status: StopProgressStatus = 'EN_ROUTE';
  let distanceToNextStopMeters = 0;

  // Check each stop in order
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]!;
    const distToStopMeters = Math.round(
      haversineKm(ping.latitude, ping.longitude, stop.latitude, stop.longitude) * 1000
    );
    const geofenceRadius = stop.geofenceRadiusMeters || 50;

    // Check if vehicle is within geofence of this stop
    if (distToStopMeters <= geofenceRadius) {
      currentStopOrder = stop.stopOrder;
      nextStopIndex = i;
      status = 'AT_STOP';
      distanceToNextStopMeters = distToStopMeters;
      break;
    }

    // Check if vehicle has already passed this stop:
    // Either vehicle's linear distance along the polyline is beyond the stop + 75m,
    // OR previously confirmed departed by state and currently outside 75m
    const isPastStop = busLinearKm > stop.distanceFromOriginKm + 0.075;
    const isDepartedByState = prevStopOrder >= stop.stopOrder && distToStopMeters > 75;
    const hasPassedStop = isPastStop || isDepartedByState;
    if (!hasPassedStop) {
      nextStopIndex = i;
      distanceToNextStopMeters = distToStopMeters;
      if (distToStopMeters <= 400) {
        status = 'APPROACHING';
        currentStopOrder = Math.max(0, stop.stopOrder - 1);
      } else {
        status = 'EN_ROUTE';
        currentStopOrder = Math.max(0, stop.stopOrder - 1);
      }
      break;
    } else {
      // Vehicle has passed this stop
      currentStopOrder = stop.stopOrder;
    }
  }

  // If vehicle has passed all stops
  if (currentStopOrder >= stops.length) {
    const lastStop = stops[stops.length - 1]!;
    const distToLast = Math.round(
      haversineKm(ping.latitude, ping.longitude, lastStop.latitude, lastStop.longitude) * 1000
    );
    nextStopIndex = stops.length - 1;
    distanceToNextStopMeters = distToLast;
    status = distToLast <= lastStop.geofenceRadiusMeters ? 'AT_STOP' : 'DEPARTED';
  }

  const nextStop = stops[nextStopIndex] || stops[stops.length - 1]!;

  // 5. Dynamic ETA Calculation
  // Effective speed: use moving speed if > 8 km/h; fallback to 25 km/h (transit corridor average)
  const speedKmh = ping.speed > 8 ? ping.speed : 25;
  const speedMps = (speedKmh * 1000) / 3600;
  const etaSeconds = status === 'AT_STOP'
    ? 0
    : Math.max(0, Math.round(distanceToNextStopMeters / speedMps));

  // 6. Calculate Overall Progress Percentage (0 - 100%)
  const effectiveTotalKm = totalDistanceKm > 0 ? totalDistanceKm : 1;
  const progressPercent = Math.min(100, Math.max(0, Number(((busLinearKm / effectiveTotalKm) * 100).toFixed(1))));

  const progress: VehicleRouteProgress = {
    busId: ping.busId,
    routeId,
    currentStopOrder,
    nextStopId: nextStop.stopId,
    nextStopName: nextStop.name,
    distanceToNextStopMeters,
    etaSeconds,
    status,
    linearDistanceCoveredKm: busLinearKm,
    totalRouteDistanceKm: totalDistanceKm,
    progressPercent,
    updatedAt: Date.now(),
  };

  // 7. Atomic Cache Update to Redis hash (60-second TTL, ZERO database writes)
  if (redis.status === 'ready' || redis.status === 'connect') {
    try {
      const pipeline = redis.pipeline();
      pipeline.hset(`bus:${ping.busId}:progress`, {
        routeId,
        currentStopOrder: progress.currentStopOrder.toString(),
        nextStopId: progress.nextStopId,
        nextStopName: progress.nextStopName,
        distanceToNextStopMeters: progress.distanceToNextStopMeters.toString(),
        etaSeconds: progress.etaSeconds.toString(),
        status: progress.status,
        linearDistanceCoveredKm: progress.linearDistanceCoveredKm.toString(),
        totalRouteDistanceKm: progress.totalRouteDistanceKm.toString(),
        progressPercent: progress.progressPercent.toString(),
        updatedAt: progress.updatedAt.toString(),
      });
      pipeline.expire(`bus:${ping.busId}:progress`, 60);
      await pipeline.exec();
    } catch (err) {
      console.warn(`[GeofenceEngine] Failed to write progress to Redis for bus ${ping.busId}:`, err);
    }
  }

  return progress;
}

/**
 * Cleans up vehicle progress cache when driver ends transit duty
 */
export async function clearVehicleProgress(busId: string): Promise<void> {
  try {
    await redis.del(`bus:${busId}:progress`);
  } catch (err) {
    console.warn(`[GeofenceEngine] Failed to delete progress cache for bus ${busId}:`, err);
  }
}
