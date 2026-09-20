import { redis } from '../../infrastructure/redis.js';
import { TelemetryPing, IngestionResult, IngestionStatus } from './telemetry.schemas.js';

/**
 * Calculates distance in km between two lat/lng points using Haversine formula
 */
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 * High-Frequency Telemetry Ingestion Service (Hot Path)
 * ZERO Database Writes - All Operations Execute In-Memory in Redis 7
 */
export async function processTelemetryPing(ping: TelemetryPing): Promise<IngestionResult> {
  const nowMs = Date.now();

  // Guard 1: Clock Drift Check (Reject timestamps drifting > 60s from server host clock)
  if (Math.abs(nowMs - ping.timestamp) > 60000) {
    return {
      status: IngestionStatus.CLOCK_DRIFT_REJECTED,
      message: 'Telemetry timestamp rejected due to clock drift exceeding 60 seconds',
      busId: ping.busId,
    };
  }

  // Guard 2: GPS Accuracy Filtering (If accuracy > 35m, drop coordinate to prevent map jitter)
  if (ping.accuracy > 35) {
    return {
      status: IngestionStatus.LOW_ACCURACY_DROPPED,
      message: 'Coordinate dropped from spatial index due to low GPS accuracy (>35m)',
      busId: ping.busId,
    };
  }

  // Guard 3: Speed Spike Suppression (Verify against previous cached position)
  const existingState = await redis.hgetall(`bus:${ping.busId}:state`);
  if (existingState && existingState.lastSeen) {
    const prevTimeMs = parseInt(existingState.lastSeen, 10);
    const timeDeltaHours = (ping.timestamp - prevTimeMs) / 3600000;

    if (timeDeltaHours > 0) {
      // Fetch previous coordinates from GEO set
      const pos = await redis.geopos('buses:live', ping.busId);
      if (pos && pos[0] && pos[0][0] !== null && pos[0][1] !== null) {
        const prevLng = parseFloat(pos[0][0]);
        const prevLat = parseFloat(pos[0][1]);
        const distanceKm = haversineDistanceKm(prevLat, prevLng, ping.latitude, ping.longitude);
        const calculatedSpeed = distanceKm / timeDeltaHours;

        if (calculatedSpeed > 140) {
          return {
            status: IngestionStatus.SPEED_SPIKE_DROPPED,
            message: `Coordinate dropped as speed spike (${calculatedSpeed.toFixed(1)} km/h) exceeds max threshold`,
            busId: ping.busId,
          };
        }
      }
    }
  }

  // Atomic Redis Pipeline Transaction
  const pipeline = redis.pipeline();

  // 1. Update Spatial Geospatial Index (GEOADD buses:live <lng> <lat> <busId>)
  pipeline.geoadd('buses:live', ping.longitude, ping.latitude, ping.busId);

  // 2. Update Dynamic Bus Metadata Hash
  pipeline.hset(`bus:${ping.busId}:state`, {
    routeId: ping.routeId,
    speed: ping.speed.toString(),
    heading: ping.heading.toString(),
    status: 'ACTIVE',
    lastSeen: ping.timestamp.toString(),
  });

  // 3. Set short-lived TTL to auto-expire orphaned / disconnected vehicles after 30s
  pipeline.expire(`bus:${ping.busId}:state`, 30);

  // 4. Publish to internal real-time telemetry message bus channel
  pipeline.publish('telemetry:broadcast', JSON.stringify(ping));

  await pipeline.exec();

  return {
    status: IngestionStatus.SUCCESS,
    message: 'Telemetry ping successfully processed into memory',
    busId: ping.busId,
  };
}
