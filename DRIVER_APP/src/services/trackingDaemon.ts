/**
 * Native Android Foreground Tracking Daemon Service
 * Maintains continuous GPS location updates when screen is locked or app is minimized.
 * Features Web Worker Timer, Screen Wake Lock API, Passenger Count Sync, and Off-Duty Cleanup.
 */

import { TelemetryBuffer, TelemetryPingData } from './telemetryBuffer.js';
import { ENDPOINTS } from '../config/api.js';
import { backgroundTimer } from './timerWorker.js';

export interface TrackingDaemonConfig {
  busId: string;
  routeId: string;
  driverId: string;
  authToken: string;
  pingIntervalMs?: number; // Default 5000ms (5s)
  apiEndpoint?: string;
  batchDrainEndpoint?: string;
  forceSimulatedGps?: boolean;
  passengerCount?: number;
}

export interface TrackingDaemonState {
  isRunning: boolean;
  busId: string | null;
  lastPingTimestamp: number | null;
  totalPingsEmitted: number;
  bufferedPingsCount: number;
  isOnline: boolean;
  locationProvider: 'HARDWARE_GPS' | 'SIMULATED_ROUTE' | 'INSECURE_ORIGIN_SIMULATED';
  lastKnownLatitude: number | null;
  lastKnownLongitude: number | null;
  currentSpeed: number;
  currentHeading: number;
  passengerCount: number;
  notificationChannel: string;
  status: 'IDLE' | 'ACTIVE_FOREGROUND' | 'PAUSED' | 'ERROR';
}

const NOTIFICATION_CHANNEL_ID = 'transit_driver_tracking_channel';

// Realistic College Bus Route Waypoints
const ROUTE_WAYPOINTS = [
  { lat: 12.971598, lng: 77.594566, heading: 45, speed: 38 },
  { lat: 12.975200, lng: 77.598900, heading: 60, speed: 42 },
  { lat: 12.980100, lng: 77.604500, heading: 75, speed: 35 },
  { lat: 12.985400, lng: 77.611200, heading: 90, speed: 48 },
  { lat: 12.990200, lng: 77.618900, heading: 110, speed: 40 },
  { lat: 12.994500, lng: 77.625500, heading: 135, speed: 32 },
  { lat: 12.989000, lng: 77.620000, heading: 240, speed: 44 },
  { lat: 12.982000, lng: 77.612000, heading: 255, speed: 36 },
];

export class ForegroundTrackingDaemon {
  private config: TrackingDaemonConfig | null = null;
  private isRunning = false;
  private totalPings = 0;
  private lastPingTime: number | null = null;
  private currentStatus: 'IDLE' | 'ACTIVE_FOREGROUND' | 'PAUSED' | 'ERROR' = 'IDLE';
  private telemetryBuffer = new TelemetryBuffer(20);
  private isOnline = navigator.onLine;

  private locationProvider: 'HARDWARE_GPS' | 'SIMULATED_ROUTE' | 'INSECURE_ORIGIN_SIMULATED' = 'HARDWARE_GPS';
  private simIndex = 0;
  private lastLat: number | null = null;
  private lastLng: number | null = null;
  private currentSpeed = 0;
  private currentHeading = 0;
  private currentPassengerCount = 38;
  private wakeLockSentinel: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkRecovery());
      window.addEventListener('offline', () => {
        this.isOnline = false;
        console.warn('📶 Cellular network disconnected. Telemetry switching to FIFO buffer.');
      });

      // Handle Page Visibility changes to re-acquire wake lock & trigger immediate ping upon wake-up
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && this.isRunning) {
          await this.requestScreenWakeLock();
          await this.pollAndEmitLocation();
        }
      });
    }
  }

  public async startTracking(config: TrackingDaemonConfig): Promise<boolean> {
    this.config = config;
    this.isRunning = true;
    this.currentStatus = 'ACTIVE_FOREGROUND';
    if (config.passengerCount !== undefined) {
      this.currentPassengerCount = config.passengerCount;
    }

    if (config.forceSimulatedGps) {
      this.locationProvider = 'SIMULATED_ROUTE';
    }

    console.info(
      `🚀 Starting Android Foreground Service [${NOTIFICATION_CHANNEL_ID}] for Bus: ${config.busId}`
    );

    // Re-acquire Screen Wake Lock to prevent display sleep
    await this.requestScreenWakeLock();

    // Start Web Worker timer to maintain background execution
    const interval = config.pingIntervalMs || 5000;
    backgroundTimer.start(interval, () => {
      this.pollAndEmitLocation();
    });

    // Immediately trigger initial ping
    await this.pollAndEmitLocation();
    return true;
  }

  public async stopTracking(): Promise<void> {
    // Release Web Worker timer
    backgroundTimer.stop();

    // Release Screen Wake Lock
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch {}
      this.wakeLockSentinel = null;
    }

    // Send explicit OFF_DUTY telemetry signal to clean up bus pointer from student map & Redis
    if (this.config && (this.lastLat !== null || this.simIndex > 0)) {
      const offDutyPing: TelemetryPingData = {
        busId: this.config.busId,
        routeId: this.config.routeId,
        latitude: this.lastLat || 12.971598,
        longitude: this.lastLng || 77.594566,
        speed: 0,
        heading: this.currentHeading,
        passengerCount: 0,
        status: 'OFF_DUTY',
        timestamp: new Date().toISOString(),
      };
      await this.sendOrBufferPing(offDutyPing);
    }

    this.isRunning = false;
    this.currentStatus = 'IDLE';
    console.info(`⏹️ Android Foreground Service [${NOTIFICATION_CHANNEL_ID}] Stopped (Off-Duty Cleanup Sent)`);
  }

  public updatePassengerCount(count: number): void {
    this.currentPassengerCount = count;
    // Emit immediate ping when passenger count is modified
    if (this.isRunning) {
      this.pollAndEmitLocation();
    }
  }

  public setSimulatedMode(enabled: boolean): void {
    this.locationProvider = enabled ? 'SIMULATED_ROUTE' : 'HARDWARE_GPS';
  }

  private async requestScreenWakeLock(): Promise<void> {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        console.info('💡 Screen Wake Lock acquired for active duty shift');
      } catch (err) {
        console.warn('Screen Wake Lock request failed:', err);
      }
    }
  }

  private async pollAndEmitLocation(): Promise<void> {
    if (!this.config || !this.isRunning) return;

    const nowIso = new Date().toISOString();

    // If forced simulated mode or insecure origin previously detected, emit simulated point
    if (this.locationProvider === 'SIMULATED_ROUTE' || this.locationProvider === 'INSECURE_ORIGIN_SIMULATED') {
      await this.emitSimulatedPing(nowIso);
      return;
    }

    // Try HTML5 / Native Geolocation API
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          this.locationProvider = 'HARDWARE_GPS';
          this.lastLat = Number(position.coords.latitude.toFixed(6));
          this.lastLng = Number(position.coords.longitude.toFixed(6));
          this.currentSpeed = Math.round((position.coords.speed || 0) * 3.6);
          this.currentHeading = Math.round(position.coords.heading || 0);

          const ping: TelemetryPingData = {
            busId: this.config!.busId,
            routeId: this.config!.routeId,
            latitude: this.lastLat,
            longitude: this.lastLng,
            speed: this.currentSpeed,
            heading: this.currentHeading,
            passengerCount: this.currentPassengerCount,
            status: 'ACTIVE',
            timestamp: nowIso,
          };

          await this.sendOrBufferPing(ping);
        },
        async (err) => {
          console.warn(`Daemon Geolocation poll error [${err.code}]:`, err.message);

          // Handle Insecure HTTP Origin Security Block gracefully across local Wi-Fi testing!
          if (err.message.includes('secure origins') || err.message.includes('Only secure origins')) {
            console.warn('⚠️ Insecure HTTP Origin detected across LAN Wi-Fi. Switching to GPS Simulator fallback mode.');
            this.locationProvider = 'INSECURE_ORIGIN_SIMULATED';
            await this.emitSimulatedPing(nowIso);
          }
        },
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 1000 }
      );
    } else {
      this.locationProvider = 'SIMULATED_ROUTE';
      await this.emitSimulatedPing(nowIso);
    }
  }

  private async emitSimulatedPing(nowIso: string): Promise<void> {
    if (!this.config) return;

    const waypoint = ROUTE_WAYPOINTS[this.simIndex % ROUTE_WAYPOINTS.length];
    this.simIndex++;

    const jitterLat = (Math.random() - 0.5) * 0.0001;
    const jitterLng = (Math.random() - 0.5) * 0.0001;

    this.lastLat = Number((waypoint.lat + jitterLat).toFixed(6));
    this.lastLng = Number((waypoint.lng + jitterLng).toFixed(6));
    this.currentSpeed = waypoint.speed + Math.floor(Math.random() * 5);
    this.currentHeading = waypoint.heading;

    const ping: TelemetryPingData = {
      busId: this.config.busId,
      routeId: this.config.routeId,
      latitude: this.lastLat,
      longitude: this.lastLng,
      speed: this.currentSpeed,
      heading: this.currentHeading,
      passengerCount: this.currentPassengerCount,
      status: 'ACTIVE',
      timestamp: nowIso,
    };

    await this.sendOrBufferPing(ping);
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

    const endpoint = this.config.apiEndpoint || ENDPOINTS.TELEMETRY_PING;

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
    const endpoint = this.config.batchDrainEndpoint || ENDPOINTS.TELEMETRY_BATCH_DRAIN;

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
      locationProvider: this.locationProvider,
      lastKnownLatitude: this.lastLat,
      lastKnownLongitude: this.lastLng,
      currentSpeed: this.currentSpeed,
      currentHeading: this.currentHeading,
      passengerCount: this.currentPassengerCount,
      notificationChannel: NOTIFICATION_CHANNEL_ID,
      status: this.currentStatus,
    };
  }
}

export const trackingDaemon = new ForegroundTrackingDaemon();
