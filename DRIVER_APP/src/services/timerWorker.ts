/**
 * Web Worker Background Timer Service
 * Prevents OS timer throttling when driver app is backgrounded or screen is turned off.
 */

const workerCode = `
  let timerId = null;

  self.onmessage = function(e) {
    const { action, intervalMs } = e.data;

    if (action === 'start') {
      if (timerId) clearInterval(timerId);
      timerId = setInterval(() => {
        self.postMessage({ type: 'tick', timestamp: Date.now() });
      }, intervalMs || 5000);
    } else if (action === 'stop') {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }
  };
`;

export class BackgroundTimer {
  private worker: Worker | null = null;
  private onTickCallback: (() => void) | null = null;

  public start(intervalMs: number, onTick: () => void): void {
    this.stop();
    this.onTickCallback = onTick;

    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e) => {
        if (e.data.type === 'tick' && this.onTickCallback) {
          this.onTickCallback();
        }
      };

      this.worker.postMessage({ action: 'start', intervalMs });
      console.info('⚡ Web Worker background timer started');
    } catch (err) {
      console.warn('Web Worker fallback to main thread timer:', err);
      // Fallback to main thread interval if Web Workers are restricted
      const timer = setInterval(() => {
        if (this.onTickCallback) this.onTickCallback();
      }, intervalMs);
      this.worker = { terminate: () => clearInterval(timer) } as any;
    }
  }

  public stop(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ action: 'stop' });
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
    this.onTickCallback = null;
  }
}

export const backgroundTimer = new BackgroundTimer();
