import { ServerResponse } from 'node:http';
import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { TelemetryPing } from './telemetry.schemas.js';
import { VehicleRouteProgress } from '../routes/routes.schemas.js';

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    busId: string;
    routeId: string;
    speed: number;
    heading: number;
    passengerCount?: number;
    status: string;
    lastSeen: number;
    progress?: VehicleRouteProgress;
    driverName?: string;
    driverPhone?: string;
    isDelegated?: boolean;
    isOffRoute?: boolean;
    deviationMeters?: number;
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface SSEClient {
  id: string;
  routeId?: string;
  res: ServerResponse;
}

export class SSEHub {
  private static instance: SSEHub;
  private clients: Map<string, SSEClient> = new Map();
  private activeBuses: Map<string, TelemetryPing> = new Map();
  private subscriberRedis: Redis;
  private batchTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  private isTestEnv(): boolean {
    return (
      env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'test' ||
      process.env.npm_lifecycle_event === 'test' ||
      process.execArgv.includes('--test') ||
      process.argv.includes('--test')
    );
  }

  private constructor() {
    const isTest = this.isTestEnv();
    this.subscriberRedis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (isTest || times > 2) {
          return null; // Stop reconnecting immediately in tests when Redis is not running
        }
        return Math.min(times * 50, 1000);
      },
    });

    // Suppress unhandled error crash when Redis is offline in test/dev
    this.subscriberRedis.on('error', (err) => {
      if (!isTest) {
        console.warn('⚠️ SSEHub Redis subscriber error:', err.message);
      }
    });

    if (!isTest) {
      this.initPubSub();
      this.startMicroBatchFlusher();
      this.startHeartbeatEmitter();
    }
  }

  public static getInstance(): SSEHub {
    if (!SSEHub.instance) {
      SSEHub.instance = new SSEHub();
    }
    return SSEHub.instance;
  }

  private initPubSub() {
    this.subscriberRedis.subscribe('telemetry:broadcast', (err) => {
      if (err) {
        console.error('❌ Failed to subscribe to telemetry:broadcast Redis channel:', err);
      } else {
        console.info('📡 Subscribed to Redis telemetry:broadcast Pub/Sub channel');
      }
    });

    this.subscriberRedis.on('message', (channel, message) => {
      if (channel === 'telemetry:broadcast') {
        try {
          const ping: TelemetryPing = JSON.parse(message);
          if (ping.status === 'OFF_DUTY') {
            this.activeBuses.delete(ping.busId);
          } else {
            this.activeBuses.set(ping.busId, ping);
          }
        } catch (err) {
          console.error('Failed to parse telemetry Pub/Sub frame:', err);
        }
      }
    });
  }

  /**
   * Starts 500ms Micro-Batch Debounce Flusher (Flushes GeoJSON snapshots twice per second)
   */
  private startMicroBatchFlusher() {
    this.batchTimer = setInterval(() => {
      if (this.clients.size === 0) return;

      const now = Date.now();
      
      // Remove stale buses (> 35s without telemetry)
      for (const [busId, ping] of this.activeBuses.entries()) {
        const pingTime = typeof ping.timestamp === 'number' ? ping.timestamp : new Date(ping.timestamp).getTime();
        if (now - pingTime > 35000) {
          this.activeBuses.delete(busId);
        }
      }

      const allFeatures: GeoJSONFeature[] = [];
      const routeFeatureMap: Map<string, GeoJSONFeature[]> = new Map();

      for (const [busId, ping] of this.activeBuses.entries()) {
        const routeId = ping.routeId || '';
        const timestampMs = typeof ping.timestamp === 'number' ? ping.timestamp : new Date(ping.timestamp).getTime();

        const progressObj = (ping as any).progress as VehicleRouteProgress | undefined;
        const isOffRoute = Boolean((ping as any).isOffRoute ?? progressObj?.isOffRoute);
        const deviationMeters = Number((ping as any).deviationMeters ?? progressObj?.deviationMeters ?? 0);

        const feature: GeoJSONFeature = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [ping.longitude, ping.latitude],
          },
          properties: {
            busId,
            routeId,
            speed: ping.speed,
            heading: ping.heading,
            passengerCount: ping.passengerCount ?? 0,
            status: ping.status || 'ACTIVE',
            lastSeen: timestampMs,
            progress: progressObj,
            driverName: (ping as any).driverName,
            driverPhone: (ping as any).driverPhone,
            isDelegated: Boolean((ping as any).isDelegated),
            isOffRoute,
            deviationMeters,
          },
        };

        allFeatures.push(feature);

        if (routeId) {
          if (!routeFeatureMap.has(routeId)) {
            routeFeatureMap.set(routeId, []);
          }
          routeFeatureMap.get(routeId)!.push(feature);
        }
      }

      // Flush to connected SSE clients
      for (const client of this.clients.values()) {
        let featuresToSend = allFeatures;
        if (client.routeId && routeFeatureMap.has(client.routeId)) {
          featuresToSend = routeFeatureMap.get(client.routeId)!;
        } else if (client.routeId) {
          featuresToSend = []; // No active buses on this route yet
        }

        const payload: GeoJSONFeatureCollection = {
          type: 'FeatureCollection',
          features: featuresToSend,
        };

        const frame = `event: fleet-snapshot\nid: ${now}\ndata: ${JSON.stringify(payload)}\n\n`;
        client.res.write(frame);
      }
    }, 500);

    if (this.batchTimer && typeof this.batchTimer.unref === 'function') {
      this.batchTimer.unref();
    }
  }

  /**
   * Starts 15-second heartbeat ping to prevent HTTP proxy connection timeouts
   */
  private startHeartbeatEmitter() {
    this.heartbeatTimer = setInterval(() => {
      if (this.clients.size === 0) return;
      for (const client of this.clients.values()) {
        client.res.write(': heartbeat\n\n');
      }
    }, 15000);

    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Registers a new SSE client connection
   */
  public addClient(client: SSEClient) {
    this.clients.set(client.id, client);
    console.info(`🟢 SSE Client connected (${client.id}). Total listeners: ${this.clients.size}`);
  }

  /**
   * Removes an SSE client connection on disconnect
   */
  public removeClient(id: string) {
    if (this.clients.has(id)) {
      this.clients.delete(id);
      console.info(`🔴 SSE Client disconnected (${id}). Remaining listeners: ${this.clients.size}`);
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public close() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    try {
      this.subscriberRedis.disconnect();
    } catch {}
    this.clients.clear();
  }
}

export const sseHub = SSEHub.getInstance();
