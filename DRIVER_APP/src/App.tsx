import React, { useState, useEffect } from 'react';
import {
  Zap,
  Radio,
  Navigation,
  Gauge,
  Users,
  BatteryCharging,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Play,
  Square,
  CheckCircle2,
  Wifi,
  WifiOff,
  MapPin,
  Bus,
} from 'lucide-react';
import { requestBatteryExemption } from './services/batteryOptimization';
import { trackingDaemon, TrackingDaemonState } from './services/trackingDaemon';

export const App: React.FC = () => {
  const [daemonState, setDaemonState] = useState<TrackingDaemonState>(trackingDaemon.getState());
  const [batteryStatus, setBatteryStatus] = useState<string>('Exemption Ready');
  const [passengerCount, setPassengerCount] = useState<number>(42);
  const maxCapacity = 55;
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [simulatedMode, setSimulatedMode] = useState<boolean>(false);

  // Poll daemon status every second to update UI
  useEffect(() => {
    const interval = setInterval(() => {
      setDaemonState(trackingDaemon.getState());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestExemption = async () => {
    const status = await requestBatteryExemption();
    setBatteryStatus(status.message);
  };

  const handleToggleTracking = async () => {
    if (daemonState.isRunning) {
      trackingDaemon.stopTracking();
    } else {
      await trackingDaemon.startTracking({
        busId: '11111111-1111-4111-8111-111111111111',
        routeId: 'a1111111-1111-4111-8111-111111111111',
        driverId: 'captain-ramesh-1',
        authToken: 'demo-driver-token',
        forceSimulatedGps: simulatedMode,
      });
    }
    setDaemonState(trackingDaemon.getState());
  };

  const toggleSimulatedMode = (enabled: boolean) => {
    setSimulatedMode(enabled);
    trackingDaemon.setSimulatedMode(enabled);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  const getStatusBadge = () => {
    if (!daemonState.isRunning) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          OFF DUTY
        </span>
      );
    }
    if (!daemonState.isOnline) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
          <WifiOff className="w-3.5 h-3.5" />
          CELLULAR DISCONNECT ({daemonState.bufferedPingsCount} BUFFERED)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-emerald">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
        ON DUTY (LIVE TELEMETRY)
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 font-sans pb-12 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-50 glass-card px-4 py-3.5 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Bus className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-950 rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-white">Captain Ramesh Kumar</h1>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                VERIFIED
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <span>KA-01-EQ-4589</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">Route #12 (Whitefield Express)</span>
            </p>
          </div>
        </div>

        <button
          onClick={toggleFullscreen}
          className="glass-button p-2.5 rounded-xl text-slate-300 hover:text-white flex items-center gap-1.5 text-xs font-medium active:scale-95"
          title="Toggle Fullscreen Mode"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-1">
          {getStatusBadge()}
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            Ping Rate: 5s
          </span>
        </div>

        {/* Insecure HTTP Security Warning Banner (Addressing User Feedback #2) */}
        {daemonState.locationProvider === 'INSECURE_ORIGIN_SIMULATED' && (
          <div className="glass-card-rose rounded-2xl p-4 flex items-start gap-3 border border-rose-500/30">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-bounce" />
            <div className="space-y-1 text-xs">
              <p className="font-bold text-rose-200">HTTP Wi-Fi Geolocation Notice</p>
              <p className="text-rose-300/90 leading-relaxed">
                Browser security blocks raw GPS over unencrypted <code className="bg-slate-950/60 px-1 py-0.5 rounded font-mono text-rose-200">http://</code> LAN Wi-Fi IPs.
              </p>
              <p className="text-emerald-300 font-semibold pt-1">
                ✅ Auto-activated Route GPS Simulator so your backend pings and student map updates work seamlessly!
              </p>
            </div>
          </div>
        )}

        {/* Hero Duty Switch (Uber / Rapido Style Large Tactile Action Button) */}
        <div
          className={`rounded-3xl p-6 transition-all duration-300 border ${
            daemonState.isRunning ? 'glass-card-rose glow-rose' : 'glass-card-emerald glow-emerald'
          }`}
        >
          <div className="text-center space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-slate-900/60 border border-slate-700/50">
              {daemonState.isRunning ? (
                <Radio className="w-10 h-10 text-rose-400 animate-pulse" />
              ) : (
                <Zap className="w-10 h-10 text-emerald-400 animate-pulse-slow" />
              )}
            </div>

            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-white">
                {daemonState.isRunning ? 'SHIFT IN PROGRESS' : 'READY TO START DUTY?'}
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                {daemonState.isRunning
                  ? 'Transmitting sub-second telemetry to college student map'
                  : 'Tap below to initiate Android foreground location daemon'}
              </p>
            </div>

            <button
              onClick={handleToggleTracking}
              className={`w-full py-4 px-6 rounded-2xl font-bold text-base tracking-wide flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-xl ${
                daemonState.isRunning
                  ? 'bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-rose-900/40'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-emerald-950/50'
              }`}
            >
              {daemonState.isRunning ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  END DUTY (GO OFFLINE)
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  START DUTY (GO ONLINE)
                </>
              )}
            </button>
          </div>
        </div>

        {/* GPS Source / Simulator Toggle */}
        <div className="glass-card rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Navigation className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-slate-200">GPS Mode Override</p>
              <p className="text-[11px] text-slate-400">
                {daemonState.locationProvider === 'HARDWARE_GPS'
                  ? 'Native Device Hardware GPS'
                  : daemonState.locationProvider === 'INSECURE_ORIGIN_SIMULATED'
                  ? 'Wi-Fi HTTP Simulator'
                  : 'Simulated Route Track'}
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleSimulatedMode(!simulatedMode)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              simulatedMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {simulatedMode ? 'Simulator Active' : 'Force Simulator'}
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: Speedometer */}
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">Speedometer</span>
              <Gauge className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black tracking-tight text-white">
                  {daemonState.currentSpeed}
                </span>
                <span className="text-xs font-bold text-emerald-400">km/h</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Heading: <span className="text-slate-200 font-semibold">{daemonState.currentHeading}° NE</span>
              </p>
            </div>
          </div>

          {/* Card 2: Telemetry Stream Stats */}
          <div className="glass-card rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">Pings Sent</span>
              <Radio className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <div className="text-3xl font-black tracking-tight text-white">
                {daemonState.totalPingsEmitted}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                <span>Buffer:</span>
                <span className={`font-bold ${daemonState.bufferedPingsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {daemonState.bufferedPingsCount}/20
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Passenger Occupancy Counter (Uber Captain Style) */}
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Passenger Load Count
              </span>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {Math.round((passengerCount / maxCapacity) * 100)}% Full
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setPassengerCount((prev) => Math.max(0, prev - 1))}
              className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xl flex items-center justify-center active:scale-90 border border-slate-700"
            >
              -
            </button>

            <div className="text-center">
              <span className="text-2xl font-black text-white">{passengerCount}</span>
              <span className="text-xs text-slate-400 font-medium"> / {maxCapacity} Seats</span>
            </div>

            <button
              onClick={() => setPassengerCount((prev) => Math.min(maxCapacity, prev + 1))}
              className="w-12 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xl flex items-center justify-center active:scale-90 shadow-lg shadow-emerald-950/40"
            >
              +
            </button>
          </div>
        </div>

        {/* Battery & Android Shield Module */}
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                Android Battery Doze Shield
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </p>
              <p className="text-[11px] text-slate-400">{batteryStatus}</p>
            </div>
          </div>
          <button
            onClick={handleRequestExemption}
            className="glass-button px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-300 hover:text-emerald-200"
          >
            Re-check
          </button>
        </div>

        {/* Route Progress Timeline (Uber/Rapido Captain Navigation Sequence) */}
        <div className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-400" />
              Route #12 Timeline
            </span>
            <span className="text-slate-400">Next: Tech Park Stop</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-600"></div>
              <span className="line-through">Campus Main Gate</span>
              <span className="ml-auto text-[10px] text-slate-500">08:00 AM</span>
            </div>

            <div className="flex items-center gap-3 font-semibold text-emerald-300">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
              <span>Tech Park Junction (En Route)</span>
              <span className="ml-auto text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-300">
                2 mins away
              </span>
            </div>

            <div className="flex items-center gap-3 text-slate-400 opacity-60">
              <div className="w-2.5 h-2.5 rounded-full border border-slate-500"></div>
              <span>Central Student Hostels</span>
              <span className="ml-auto text-[10px]">08:20 AM</span>
            </div>
          </div>
        </div>

        {/* PWA Fullscreen Launcher Advice */}
        <div className="text-center pt-2">
          <p className="text-[11px] text-slate-500">
            💡 Tap <strong className="text-slate-400">"Add to Home Screen"</strong> in your mobile browser to run as a full-screen native app without address bars!
          </p>
        </div>
      </main>
    </div>
  );
};

export default App;
