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

// ---------------------------------------------------------------------------
// ROUTE & STOP INGESTION PIPELINE (Sprint 19)
// ---------------------------------------------------------------------------

/**
 * Calculates perpendicular linear distance along polyline from origin to nearest point for a coordinate
 */
export function calculateLinearDistanceOnPolyline(
  lat: number,
  lng: number,
  polyline: [number, number][]
): number {
  if (polyline.length <= 1) return 0;

  let minDistanceM = Infinity;
  let distanceAtBestOriginKm = 0;
  let bestT = 0;
  let bestSegLengthKm = 0;
  let cumulativeKm = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [lngA, latA] = polyline[i]!;
    const [lngB, latB] = polyline[i + 1]!;
    const segLengthKm = haversineKm(latA, lngA, latB, lngB);

    const midLat = ((latA + latB) / 2) * (Math.PI / 180);
    const cosMidLat = Math.cos(midLat);
    const x = (lng - lngA) * cosMidLat;
    const y = lat - latA;
    const dx = (lngB - lngA) * cosMidLat;
    const dy = latB - latA;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (x * dx + y * dy) / lenSq));
    }
    const projLat = latA + t * (latB - latA);
    const projLng = lngA + t * (lngB - lngA);
    const distToProjM = haversineKm(lat, lng, projLat, projLng) * 1000;

    if (distToProjM < minDistanceM) {
      minDistanceM = distToProjM;
      distanceAtBestOriginKm = cumulativeKm;
      bestT = t;
      bestSegLengthKm = segLengthKm;
    }

    cumulativeKm += segLengthKm;
  }

  return Number((distanceAtBestOriginKm + bestT * bestSegLengthKm).toFixed(2));
}

/**
 * Connects stops along real roads using OpenStreetMap OSRM driving engine
 * Falls back to direct waypoints if network is unavailable or offline
 */
export async function fetchRoadPolyline(
  coordinates: [number, number][]
): Promise<[number, number][]> {
  if (coordinates.length < 2) {
    return coordinates;
  }

  try {
    const coordsStr = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.routes?.[0]?.geometry?.coordinates && Array.isArray(data.routes[0].geometry.coordinates)) {
        return data.routes[0].geometry.coordinates as [number, number][];
      }
    }
  } catch (err) {
    console.warn('[RouteService] OSRM road routing offline/fallback, using direct waypoints:', err);
  }

  return coordinates;
}

export interface StopMetricInput {
  name: string;
  code?: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters?: number;
}

export interface CalculatedStopMetric extends StopMetricInput {
  stopOrder: number;
  distanceFromOriginKm: number;
  estimatedMinutesFromStart: number;
  geofenceRadiusMeters: number;
}

/**
 * Calculates cumulative distance and scheduled arrival minutes for each stop along the polyline
 */
export function calculateStopMetrics(
  stops: StopMetricInput[],
  polylineCoordinates: [number, number][]
): CalculatedStopMetric[] {
  if (stops.length === 0) return [];

  // Map and sort stops by linear distance along polyline
  const mapped = stops.map((stop, index) => {
    const linearDistKm = calculateLinearDistanceOnPolyline(
      stop.latitude,
      stop.longitude,
      polylineCoordinates
    );
    return {
      ...stop,
      geofenceRadiusMeters: stop.geofenceRadiusMeters || 50,
      linearDistKm,
      originalIndex: index,
    };
  });

  mapped.sort((a, b) => a.linearDistKm - b.linearDistKm);

  return mapped.map((stop, index) => {
    const stopOrder = index + 1;
    const travelMinutes = Math.round((stop.linearDistKm / 30) * 60);
    const dwellMinutes = index * 2;
    const estimatedMinutesFromStart = index === 0 ? 0 : Math.max(index * 2, travelMinutes + dwellMinutes);

    return {
      name: stop.name,
      code: stop.code,
      latitude: stop.latitude,
      longitude: stop.longitude,
      geofenceRadiusMeters: stop.geofenceRadiusMeters,
      stopOrder,
      distanceFromOriginKm: stop.linearDistKm,
      estimatedMinutesFromStart,
    };
  });
}

export interface IngestedRoutePayload {
  routeNumber: string;
  name: string;
  busId?: string;
  stops: StopMetricInput[];
  polylineCoordinates?: [number, number][];
}

/**
 * Ingests, validates, and persists a route and stop sequence to PostgreSQL & invalidates Redis cache
 */
export async function saveIngestedRoute(
  payload: IngestedRoutePayload
): Promise<RouteManifest> {
  let polyline = payload.polylineCoordinates;

  if (!polyline || polyline.length < 2) {
    const stopCoords: [number, number][] = payload.stops.map((s) => [s.longitude, s.latitude]);
    polyline = await fetchRoadPolyline(stopCoords);
  }

  const calculatedStops = calculateStopMetrics(payload.stops, polyline);

  const route = await prisma.$transaction(async (tx) => {
    const existing = await tx.route.findUnique({
      where: { routeNumber: payload.routeNumber },
    });

    const routeRecord = existing
      ? await tx.route.update({
          where: { id: existing.id },
          data: {
            name: payload.name,
            polylineGeoJson: JSON.stringify({ type: 'LineString', coordinates: polyline }),
          },
        })
      : await tx.route.create({
          data: {
            routeNumber: payload.routeNumber,
            name: payload.name,
            polylineGeoJson: JSON.stringify({ type: 'LineString', coordinates: polyline }),
          },
        });

    await tx.routeStop.deleteMany({
      where: { routeId: routeRecord.id },
    });

    for (const stop of calculatedStops) {
      const stopCode = stop.code && stop.code.trim() !== ''
        ? stop.code.trim()
        : `STOP-${payload.routeNumber}-${stop.stopOrder}`;

      const stopRecord = await tx.stop.upsert({
        where: { code: stopCode },
        update: {
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          geofenceRadiusMeters: stop.geofenceRadiusMeters,
        },
        create: {
          code: stopCode,
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          geofenceRadiusMeters: stop.geofenceRadiusMeters,
        },
      });

      await tx.routeStop.create({
        data: {
          routeId: routeRecord.id,
          stopId: stopRecord.id,
          stopOrder: stop.stopOrder,
          distanceFromOriginKm: stop.distanceFromOriginKm,
          estimatedMinutesFromStart: stop.estimatedMinutesFromStart,
        },
      });
    }

    if (payload.busId) {
      await tx.bus.update({
        where: { id: payload.busId },
        data: { currentRouteId: routeRecord.id },
      });
    }

    return routeRecord;
  });

  // Invalidate Redis caches
  const manifestKey = `route:${route.id}:manifest`;
  try {
    if (redis.status === 'ready' || redis.status === 'connect') {
      const pipeline = redis.pipeline();
      pipeline.del(manifestKey);
      if (payload.busId) {
        pipeline.del(`bus:${payload.busId}:progress`);
        pipeline.hset(`bus:${payload.busId}:state`, 'routeId', route.id);
      }
      await pipeline.exec();
    }
  } catch (err) {
    console.warn('[RouteService] Redis cache invalidation warning:', err);
  }

  const manifest = await getRouteManifest(route.id);
  return manifest!;
}
