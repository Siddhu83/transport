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
  lastArrivalTime: number;
  lastSeen?: number;
}

export interface UseFleetInterpolationOptions {
  defaultDurationMs?: number; // Initial default duration before ping delta is measured (e.g., 5000ms or 500ms)
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
  const { defaultDurationMs = 5000 } = options;

  const [interpolatedGeoJson, setInterpolatedGeoJson] = useState<
    GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>
  >(incomingGeoJson);

  // Store active vehicles interpolation state map
  const stateMapRef = useRef<Map<string, InterpolatedVehicleState>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // Update target states ONLY when actual coordinate/timestamp changes for a vehicle
  useEffect(() => {
    if (!incomingGeoJson || !incomingGeoJson.features) return;

    const now = performance.now();
    const currentMap = stateMapRef.current;
    const activeBusIds = new Set<string>();

    for (const feature of incomingGeoJson.features) {
      const busId = feature.properties.busId;
      activeBusIds.add(busId);

      const targetCoords = feature.geometry.coordinates as [number, number];
      const targetHeading = feature.properties.heading ?? 0;
      const lastSeen = feature.properties.lastSeen ? new Date(feature.properties.lastSeen).getTime() : 0;

      const existingState = currentMap.get(busId);

      if (existingState) {
        // Check if coordinates or timestamp actually moved/updated!
        const coordsMoved =
          existingState.targetCoords[0] !== targetCoords[0] ||
          existingState.targetCoords[1] !== targetCoords[1] ||
          (lastSeen > 0 && lastSeen !== existingState.lastSeen);

        if (coordsMoved) {
          // New actual GPS ping arrived for this bus!
          const pingDeltaMs = now - existingState.lastArrivalTime;
          // Clamp duration to reasonable boundaries (1000ms min, 10000ms max)
          const dynamicDuration = Math.max(1000, Math.min(pingDeltaMs, 10000));

          currentMap.set(busId, {
            busId,
            startCoords: existingState.currentCoords, // Start LERP from current interpolated position!
            targetCoords,
            currentCoords: existingState.currentCoords,
            startHeading: existingState.currentHeading,
            targetHeading,
            currentHeading: existingState.currentHeading,
            properties: feature.properties,
            startTime: now,
            durationMs: dynamicDuration,
            lastArrivalTime: now,
            lastSeen,
          });
        } else {
          // No new coordinate fix for this bus - preserve its ongoing LERP trajectory uninterrupted!
          currentMap.set(busId, {
            ...existingState,
            properties: feature.properties, // update dynamic properties (speed, passengerCount, etc.)
          });
        }
      } else {
        // Initial spawn of vehicle
        currentMap.set(busId, {
          busId,
          startCoords: targetCoords,
          targetCoords,
          currentCoords: targetCoords,
          startHeading: targetHeading,
          targetHeading,
          currentHeading: targetHeading,
          properties: feature.properties,
          startTime: now,
          durationMs: defaultDurationMs,
          lastArrivalTime: now,
          lastSeen,
        });
      }
    }

    // Clean up any buses that are no longer in incomingGeoJson (Off Duty eviction)
    for (const [busId] of currentMap.entries()) {
      if (!activeBusIds.has(busId)) {
        currentMap.delete(busId);
      }
    }
  }, [incomingGeoJson, defaultDurationMs]);

  // 60 FPS requestAnimationFrame continuous smooth interpolation loop
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      const updatedFeatures: GeoJSON.Feature<GeoJSON.Point, VehicleFeatureProperties>[] = [];

      stateMapRef.current.forEach((vehicle, busId) => {
        const elapsed = now - vehicle.startTime;
        const duration = vehicle.durationMs || 5000;
        const t = elapsed / duration;

        let lng: number;
        let lat: number;

        if (t <= 1.0) {
          // Standard LERP between start coordinates and target coordinates across ping span
          // Quadratic ease-in-out for smooth acceleration/deceleration
          const smoothT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          lng = lerp(vehicle.startCoords[0], vehicle.targetCoords[0], smoothT);
          lat = lerp(vehicle.startCoords[1], vehicle.targetCoords[1], smoothT);
          vehicle.currentHeading = lerpAngle(vehicle.startHeading, vehicle.targetHeading, smoothT);
        } else {
          // Smooth Extrapolation / Dead-Reckoning if next ping is slightly delayed
          // Keeps marker moving smoothly along current heading vector instead of freezing!
          const extraSec = Math.min((elapsed - duration) / 1000, 3.0); // max 3s extrapolation
          const speedKmH = vehicle.properties.speed || 35;
          const distKm = (speedKmH * extraSec) / 3600;

          const headingRad = (vehicle.targetHeading * Math.PI) / 180;
          const deltaLat = (distKm / 111.0) * Math.cos(headingRad);
          const deltaLng = (distKm / (111.0 * Math.cos((vehicle.targetCoords[1] * Math.PI) / 180))) * Math.sin(headingRad);

          lng = vehicle.targetCoords[0] + deltaLng;
          lat = vehicle.targetCoords[1] + deltaLat;
          vehicle.currentHeading = vehicle.targetHeading;
        }

        vehicle.currentCoords = [lng, lat];

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
