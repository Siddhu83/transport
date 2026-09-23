import React, { useState } from 'react';
import { requestBatteryExemption } from './services/batteryOptimization';
import { trackingDaemon } from './services/trackingDaemon';

export const App: React.FC = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [batteryStatus, setBatteryStatus] = useState<string>('Ready');

  const handleRequestExemption = async () => {
    const status = await requestBatteryExemption();
    setBatteryStatus(status.message);
  };

  const handleToggleTracking = async () => {
    if (isTracking) {
      trackingDaemon.stopTracking();
      setIsTracking(false);
    } else {
      await trackingDaemon.startTracking({
        busId: '11111111-1111-4111-8111-111111111111',
        routeId: 'a1111111-1111-4111-8111-111111111111',
        driverId: 'driver-id-1',
        authToken: 'demo-driver-token',
      });
      setIsTracking(true);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', background: '#0b0f17', color: '#fff', minHeight: '100vh' }}>
      <h1>ANITS Driver Kiosk Console</h1>
      <p>Android 14+ Foreground Tracking Daemon & Battery Optimization Bypass</p>

      <div style={{ margin: '24px 0' }}>
        <button
          onClick={handleRequestExemption}
          style={{ padding: '12px 20px', fontSize: 16, background: '#00f0ff', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', marginRight: 12 }}
        >
          Request Battery Exemption Intent
        </button>

        <button
          onClick={handleToggleTracking}
          style={{ padding: '12px 20px', fontSize: 16, background: isTracking ? '#ef4444' : '#10b981', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          {isTracking ? 'Stop Foreground Daemon' : 'Start Foreground Daemon'}
        </button>
      </div>

      <div style={{ background: '#121824', padding: 16, borderRadius: 8, marginTop: 16 }}>
        <p><strong>Status:</strong> {batteryStatus}</p>
        <p><strong>Tracking Daemon:</strong> {isTracking ? 'ACTIVE (Foreground Service)' : 'IDLE'}</p>
      </div>
    </div>
  );
};

export default App;
