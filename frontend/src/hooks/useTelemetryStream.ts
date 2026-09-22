import { useState, useEffect, useRef, useCallback } from 'react';
import { VehicleFeatureProperties } from '../components/map/FleetCanvas';

export type StreamConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

export interface UseTelemetryStreamOptions {
  routeId?: string;
  autoConnect?: boolean;
}

export interface UseTelemetryStreamReturn {
  geoJsonData: GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>;
  status: StreamConnectionStatus;
  latencyMs: number | null;
  isConnected: boolean;
  reconnectCount: number;
  reconnect: () => void;
}

const DEFAULT_GEOJSON: GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties> = {
  type: 'FeatureCollection',
  features: [],
};

export const useTelemetryStream = (
  options: UseTelemetryStreamOptions = {}
): UseTelemetryStreamReturn => {
  const { routeId, autoConnect = true } = options;

  const [geoJsonData, setGeoJsonData] = useState<
    GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>
  >(DEFAULT_GEOJSON);
  const [status, setStatus] = useState<StreamConnectionStatus>('CONNECTING');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [reconnectCount, setReconnectCount] = useState<number>(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();

    const query = routeId ? `?routeId=${encodeURIComponent(routeId)}` : '';
    const url = `/api/v1/telemetry/stream${query}`;

    setStatus(reconnectAttemptRef.current > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus('CONNECTED');
        reconnectAttemptRef.current = 0;
      };

      es.addEventListener('fleet-snapshot', (event: MessageEvent) => {
        try {
          const startTime = performance.now();
          const payload = JSON.parse(event.data);

          if (payload && payload.type === 'FeatureCollection') {
            setGeoJsonData(payload);

            // Calculate client processing latency
            const frameArrivalLatency = Math.round(performance.now() - startTime);
            setLatencyMs(frameArrivalLatency);
          }
        } catch (err) {
          console.error('Failed to parse telemetry SSE frame:', err);
        }
      });

      es.onerror = () => {
        setStatus('RECONNECTING');
        es.close();
        eventSourceRef.current = null;

        // Exponential backoff retry logic (1s, 2s, 4s, 8s, max 15s)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 15000);
        reconnectAttemptRef.current += 1;
        setReconnectCount((prev) => prev + 1);

        retryTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    } catch (err) {
      console.error('EventSource initialization error:', err);
      setStatus('OFFLINE');
    }
  }, [routeId, cleanup]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      cleanup();
    };
  }, [autoConnect, connect, cleanup]);

  return {
    geoJsonData,
    status,
    latencyMs,
    isConnected: status === 'CONNECTED',
    reconnectCount,
    reconnect: connect,
  };
};

export default useTelemetryStream;
