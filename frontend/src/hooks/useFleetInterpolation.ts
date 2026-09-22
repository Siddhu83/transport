import { useState, useEffect, useRef } from 'react';
import { VehicleFeatureProperties } from '../components/map/FleetCanvas';

export interface InterpolatedVehicleState {
  busId: string;
  startCoords: [number, number];
  targetCoords: [number, number];
  currentCoords: [number, number];
  startHeading: number;
  targetHeading: number;
  currentHeading: number;
  properties: VehicleFeatureProperties;
  startTime: number;
  durationMs: number;
}

export interface UseFleetInterpolationOptions {
  interpolationDurationMs?: number; // Default 500ms to match SSE broadcast interval
}

// Shortest path angular difference calculation (prevents 360° spin wrap-around)
function lerpAngle(startDeg: number, targetDeg: number, t: number): number {
  const diff = ((targetDeg - startDeg + 540) % 360) - 180;
  const result = (startDeg + diff * t + 360) % 360;
  return Math.round(result);
}

// Linear interpolation for coordinates
function lerp(start: number, target: number, t: number): number {
  return start + (target - start) * t;
}

export const useFleetInterpolation = (
  incomingGeoJson: GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>,
  options: UseFleetInterpolationOptions = {}
): GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties> => {
  const { interpolationDurationMs = 500 } = options;

  const [interpolatedGeoJson, setInterpolatedGeoJson] = useState<
    GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>
  >(incomingGeoJson);

  // Store active vehicles interpolation state map
  const stateMapRef = useRef<Map<string, InterpolatedVehicleState>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // Update target states whenever a new GeoJSON snapshot arrives from SSE
  useEffect(() => {
    if (!incomingGeoJson || !incomingGeoJson.features) return;

    const now = performance.now();
    const nextMap = new Map<string, InterpolatedVehicleState>();

    for (const feature of incomingGeoJson.features) {
      const busId = feature.properties.busId;
      const targetCoords = feature.geometry.coordinates as [number, number];
      const targetHeading = feature.properties.heading ?? 0;

      const existingState = stateMapRef.current.get(busId);

      if (existingState) {
        // Smooth transition from current interpolated position to new target
        nextMap.set(busId, {
          busId,
          startCoords: existingState.currentCoords,
          targetCoords,
          currentCoords: existingState.currentCoords,
          startHeading: existingState.currentHeading,
          targetHeading,
          currentHeading: existingState.currentHeading,
          properties: feature.properties,
          startTime: now,
          durationMs: interpolationDurationMs,
        });
      } else {
        // Initial spawn of vehicle
        nextMap.set(busId, {
          busId,
          startCoords: targetCoords,
          targetCoords,
          currentCoords: targetCoords,
          startHeading: targetHeading,
          targetHeading,
          currentHeading: targetHeading,
          properties: feature.properties,
          startTime: now,
          durationMs: interpolationDurationMs,
        });
      }
    }

    stateMapRef.current = nextMap;
  }, [incomingGeoJson, interpolationDurationMs]);

  // 60 FPS requestAnimationFrame continuous interpolation loop
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      const updatedFeatures: GeoJSON.Feature<GeoJSON.Point, VehicleFeatureProperties>[] = [];

      stateMapRef.current.forEach((vehicle, busId) => {
        const elapsed = now - vehicle.startTime;
        const t = Math.min(1, Math.max(0, elapsed / vehicle.durationMs));

        // Smooth cubic ease-out calculation
        const easeT = 1 - Math.pow(1 - t, 2);

        // Interpolate coordinates
        const lng = lerp(vehicle.startCoords[0], vehicle.targetCoords[0], easeT);
        const lat = lerp(vehicle.startCoords[1], vehicle.targetCoords[1], easeT);
        vehicle.currentCoords = [lng, lat];

        // Interpolate heading rotation
        vehicle.currentHeading = lerpAngle(vehicle.startHeading, vehicle.targetHeading, easeT);

        updatedFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          properties: {
            ...vehicle.properties,
            heading: vehicle.currentHeading,
          },
        });

        // Save updated current state
        stateMapRef.current.set(busId, vehicle);
      });

      setInterpolatedGeoJson({
        type: 'FeatureCollection',
        features: updatedFeatures,
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return interpolatedGeoJson;
};

export default useFleetInterpolation;
