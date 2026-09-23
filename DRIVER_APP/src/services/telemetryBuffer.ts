export interface TelemetryPingData {
  busId: string;
  latitude: number;
  longitude: number;
  speed: number; // km/h
  heading: number; // degrees 0-360
  timestamp: string; // ISO 8601 string
}

export class TelemetryBuffer {
  private buffer: TelemetryPingData[] = [];
  private readonly maxCapacity: number;

  constructor(maxCapacity: number = 20) {
    this.maxCapacity = maxCapacity;
  }

  /**
   * Enqueues a ping into the buffer. If maximum capacity is reached,
   * the oldest ping is evicted (FIFO).
   */
  public enqueue(ping: TelemetryPingData): void {
    if (this.buffer.length >= this.maxCapacity) {
      this.buffer.shift(); // Evict oldest
    }
    this.buffer.push(ping);
  }

  /**
   * Drains all enqueued pings from the buffer and returns them.
   */
  public drain(): TelemetryPingData[] {
    const pings = [...this.buffer];
    this.buffer = [];
    return pings;
  }

  public isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  public size(): number {
    return this.buffer.length;
  }
}
