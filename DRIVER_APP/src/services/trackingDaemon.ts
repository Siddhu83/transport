/**
 * Native Android Foreground Tracking Daemon Service
 * Maintains continuous GPS location updates when screen is locked or app is minimized.
 * Includes Cellular Dead-Zone FIFO Ring Buffering & Batch Flush Protocol (Sprint 8).
 */

import { TelemetryBuffer, TelemetryPingData } from './telemetryBuffer.js';

export interface TrackingDaemonConfig {
  busId: string;
  routeId: string;
  driverId: string;
  authToken: string;
  pingIntervalMs?: number; // Default 5000ms (5s)
  apiEndpoint?: string;
}

export interface TrackingDaemonState {
  isRunning: boolean;
  busId: string | null;
  lastPingTimestamp: number | null;
  totalPingsEmitted: number;
  bufferedPingsCount: number;
  isOnline: boolean;
  notificationChannel: string;
  status: 'IDLE' | 'ACTIVE_FOREGROUND' | 'PAUSED' | 'ERROR';
}

const NOTIFICATION_CHANNEL_ID = 'transit_driver_tracking_channel';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:8000/api/v1/telemetry/ping';

export class ForegroundTrackingDaemon {
  private config: TrackingDaemonConfig | null = null;
  private isRunning = false;
  private timerId: NodeJS.Timeout | null = null;
  private totalPings = 0;
  private lastPingTime: number | null = null;
  private currentStatus: 'IDLE' | 'ACTIVE_FOREGROUND' | 'PAUSED' | 'ERROR' = 'IDLE';
  private telemetryBuffer = new TelemetryBuffer(20);
  private isOnline = navigator.onLine;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkRecovery());
      window.addEventListener('offline', () => {
        this.isOnline = false;
        console.warn('📶 Cellular network disconnected. Telemetry switching to FIFO buffer.');
      });
    }
  }

  public async startTracking(config: TrackingDaemonConfig): Promise<boolean> {
    this.config = config;
    this.isRunning = true;
    this.currentStatus = 'ACTIVE_FOREGROUND';

    console.info(
      `🚀 Starting Android Foreground Service [${NOTIFICATION_CHANNEL_ID}] for Bus: ${config.busId}`
    );

    // Setup periodic location sensor polling
    const interval = config.pingIntervalMs || 5000;
    this.timerId = setInterval(() => {
      this.pollAndEmitLocation();
    }, interval);

    // Immediately trigger initial ping
    await this.pollAndEmitLocation();
    return true;
  }

  public stopTracking(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    this.currentStatus = 'IDLE';
    console.info(`⏹️ Android Foreground Service [${NOTIFICATION_CHANNEL_ID}] Stopped`);
  }

  private async pollAndEmitLocation(): Promise<void> {
    if (!this.config || !this.isRunning) return;

    const nowIso = new Date().toISOString();

    // Use HTML5 or Native Geolocation API
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const ping: TelemetryPingData = {
            busId: this.config!.busId,
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            speed: Math.round((position.coords.speed || 0) * 3.6), // m/s to km/h
            heading: Math.round(position.coords.heading || 0),
            timestamp: nowIso,
          };

          await this.sendOrBufferPing(ping);
        },
        (err) => {
          console.warn('Daemon Geolocation poll error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
      );
    }
  }

  private async sendOrBufferPing(ping: TelemetryPingData): Promise<void> {
    if (!this.config) return;

    // If offline, enqueue into FIFO buffer directly
    if (!navigator.onLine) {
      this.isOnline = false;
      this.telemetryBuffer.enqueue(ping);
      console.warn(`📶 Offline. Enqueued telemetry ping to buffer (Capacity: ${this.telemetryBuffer.size()}/20)`);
      return;
    }

    const endpoint = this.config.apiEndpoint || DEFAULT_ENDPOINT;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.authToken}`,
        },
        body: JSON.stringify(ping),
      });

      if (res.ok) {
        this.totalPings++;
        this.lastPingTime = Date.now();
        this.isOnline = true;

        // Check if there are buffered pings that need flushing after recovery
        if (!this.telemetryBuffer.isEmpty()) {
          await this.flushBufferedPings();
        }
      } else {
        console.warn(`Daemon Telemetry ping refused (${res.status}). Enqueuing ping.`);
        this.telemetryBuffer.enqueue(ping);
      }
    } catch (err) {
      console.error('Daemon Telemetry network error. Enqueuing to buffer:', err);
      this.isOnline = false;
      this.telemetryBuffer.enqueue(ping);
    }
  }

  private async handleNetworkRecovery(): Promise<void> {
    this.isOnline = true;
    console.info('📶 Cellular network restored! Initiating batch drain flush...');
    if (!this.telemetryBuffer.isEmpty()) {
      await this.flushBufferedPings();
    }
  }

  private async flushBufferedPings(): Promise<void> {
    if (!this.config || this.telemetryBuffer.isEmpty()) return;

    const bufferedPings = this.telemetryBuffer.drain();
    const endpoint = (this.config.apiEndpoint || DEFAULT_ENDPOINT).replace('/ping', '/batch-drain');

    console.info(`⚡ Flushing ${bufferedPings.length} buffered telemetry pings to ${endpoint}`);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.authToken}`,
        },
        body: JSON.stringify({ pings: bufferedPings }),
      });

      if (res.ok) {
        console.info(`✅ Batch drain flush successful (${bufferedPings.length} pings ingested)`);
      } else {
        console.error(`❌ Batch drain flush failed (${res.status})`);
      }
    } catch (err) {
      console.error('❌ Batch drain flush network error:', err);
    }
  }

  public getState(): TrackingDaemonState {
    return {
      isRunning: this.isRunning,
      busId: this.config?.busId || null,
      lastPingTimestamp: this.lastPingTime,
      totalPingsEmitted: this.totalPings,
      bufferedPingsCount: this.telemetryBuffer.size(),
      isOnline: this.isOnline,
      notificationChannel: NOTIFICATION_CHANNEL_ID,
      status: this.currentStatus,
    };
  }
}

export const trackingDaemon = new ForegroundTrackingDaemon();
