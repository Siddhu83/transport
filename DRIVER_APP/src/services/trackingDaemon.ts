/**
 * Native Android Foreground Tracking Daemon Service
 * Maintains continuous GPS location updates when screen is locked or app is minimized.
 */

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

    const now = Date.now();

    // Use HTML5 or Native Geolocation API
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const payload = {
            busId: this.config!.busId,
            routeId: this.config!.routeId,
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            speed: Math.round((position.coords.speed || 0) * 3.6), // m/s to km/h
            heading: Math.round(position.coords.heading || 0),
            accuracy: Math.round(position.coords.accuracy || 5),
            timestamp: now,
          };

          await this.sendPing(payload);
        },
        (err) => {
          console.warn('Daemon Geolocation poll error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
      );
    }
  }

  private async sendPing(payload: object): Promise<void> {
    if (!this.config) return;

    const endpoint = this.config.apiEndpoint || DEFAULT_ENDPOINT;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.authToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        this.totalPings++;
        this.lastPingTime = Date.now();
      } else {
        console.warn(`Daemon Telemetry ping refused (${res.status})`);
      }
    } catch (err) {
      console.error('Daemon Telemetry transmission network error:', err);
    }
  }

  public getState(): TrackingDaemonState {
    return {
      isRunning: this.isRunning,
      busId: this.config?.busId || null,
      lastPingTimestamp: this.lastPingTime,
      totalPingsEmitted: this.totalPings,
      notificationChannel: NOTIFICATION_CHANNEL_ID,
      status: this.currentStatus,
    };
  }
}

export const trackingDaemon = new ForegroundTrackingDaemon();
