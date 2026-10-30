import { prisma } from '../../infrastructure/prisma.js';
import { redis } from '../../infrastructure/redis.js';
import { RouteManifest, ManifestStop } from './routes.schemas.js';

/**
 * Calculates distance in km between two lat/lng points using Haversine formula
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Retrieves the linear route manifest with stop sequence and polyline coordinates.
 * Reads through Redis cache (`route:<routeId>:manifest`) to eliminate database queries on high-frequency paths.
 */
export async function getRouteManifest(routeId: string): Promise<RouteManifest | null> {
  const cacheKey = `route:${routeId}:manifest`;

  // 1. Check Redis Cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as RouteManifest;
    }
  } catch (err) {
    // If Redis is temporarily degraded, fall through to database
    console.warn(`[RouteService] Redis cache lookup failed for route ${routeId}, falling back to DB:`, err);
  }

  // 2. Query PostgreSQL via Prisma
  let route = null;
  try {
    route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        routeStops: {
          include: { stop: true },
          orderBy: { stopOrder: 'asc' },
        },
      },
    });
  } catch (dbErr) {
    console.warn(`[RouteService] Database query failed for route ${routeId}:`, dbErr);
    return null;
  }

  if (!route) {
    return null;
  }

  // 3. Parse Polyline Coordinates
  let polylineCoords: [number, number][] = [];
  if (route.polylineGeoJson) {
    try {
      const parsedGeo = JSON.parse(route.polylineGeoJson);
      if (parsedGeo.type === 'LineString' && Array.isArray(parsedGeo.coordinates)) {
        polylineCoords = parsedGeo.coordinates;
      } else if (Array.isArray(parsedGeo)) {
        polylineCoords = parsedGeo;
      }
    } catch (parseErr) {
      console.warn(`[RouteService] Malformed polylineGeoJson for route ${routeId}:`, parseErr);
    }
  }

  // If no polyline stored, connect ordered stops sequentially
  if (polylineCoords.length === 0 && route.routeStops.length > 0) {
    polylineCoords = route.routeStops.map((rs) => [rs.stop.longitude, rs.stop.latitude]);
  }

  // 4. Build Ordered Manifest Stops with Cumulative Distances
  let runningDistanceKm = 0;
  let prevLat: number | null = null;
  let prevLng: number | null = null;

  const manifestStops: ManifestStop[] = route.routeStops.map((rs, index) => {
    const lat = rs.stop.latitude;
    const lng = rs.stop.longitude;

    if (rs.distanceFromOriginKm > 0) {
      runningDistanceKm = rs.distanceFromOriginKm;
    } else if (prevLat !== null && prevLng !== null) {
      runningDistanceKm += haversineKm(prevLat, prevLng, lat, lng);
    }

    prevLat = lat;
    prevLng = lng;

    return {
      id: rs.id,
      stopId: rs.stop.id,
      name: rs.stop.name,
      code: rs.stop.code,
      stopOrder: rs.stopOrder || index + 1,
      latitude: lat,
      longitude: lng,
      estimatedMinutesFromStart: rs.estimatedMinutesFromStart,
      distanceFromOriginKm: Number(runningDistanceKm.toFixed(2)),
      geofenceRadiusMeters: rs.stop.geofenceRadiusMeters || 50,
    };
  });

  const totalDistanceKm = manifestStops.length > 0
    ? manifestStops[manifestStops.length - 1]!.distanceFromOriginKm
    : 0;

  const estimatedDurationMinutes = manifestStops.length > 0
    ? manifestStops[manifestStops.length - 1]!.estimatedMinutesFromStart
    : 0;

  const manifest: RouteManifest = {
    routeId: route.id,
    routeNumber: route.routeNumber,
    name: route.name,
    totalDistanceKm,
    estimatedDurationMinutes,
    stops: manifestStops,
    polylineCoordinates: polylineCoords,
  };

  // 5. Store in Redis Cache with 1-hour TTL
  try {
    await redis.set(cacheKey, JSON.stringify(manifest), 'EX', 3600);
  } catch (cacheErr) {
    console.warn(`[RouteService] Failed to cache route manifest in Redis:`, cacheErr);
  }

  return manifest;
}
