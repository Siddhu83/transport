import React, { useState, useEffect } from 'react';
import { FleetCanvas } from './components/map/FleetCanvas';
import { useTelemetryStream } from './hooks/useTelemetryStream';
import { useFleetInterpolation } from './hooks/useFleetInterpolation';
import { Activity, Bus, ShieldAlert, Radio, Clock, Sun, Moon, Maximize2, Minimize2, MapPin, Navigation, Users, Gauge, Compass, X } from 'lucide-react';

export const App: React.FC = () => {
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Theme Management (Dark Mode default, persists in localStorage)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ats_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('ats_theme', nextTheme);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => { });
      }
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 1. Hook: Manage SSE stream connection & latency tracking
  const { geoJsonData: rawGeoJson, status: streamStatus, latencyMs, isConnected } = useTelemetryStream();

  // 2. Hook: 60 FPS Linear Interpolation (LERP) movement & dynamic ping-delta continuous gliding engine
  const interpolatedGeoJson = useFleetInterpolation(rawGeoJson, {
    defaultDurationMs: 5000,
  });

  // Dynamically extract the selected vehicle feature directly from the live 60 FPS interpolated GeoJSON stream
  const selectedFeature = interpolatedGeoJson.features.find(
    (f) => f.properties.busId === selectedBusId
  );
  const selectedVehicleProps = selectedFeature?.properties;
  const selectedVehicleCoords = selectedFeature?.geometry.coordinates as [number, number] | undefined;

  // Real-time UTC/IST Clock update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: true }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate passenger occupancy percentage
  const passengerCount = selectedVehicleProps?.passengerCount ?? 0;
  const capacity = selectedVehicleProps?.capacity ?? 55;
  const occupancyPct = Math.min(100, Math.round((passengerCount / capacity) * 100));

  return (
    <div className="flex flex-col h-screen w-screen font-sans overflow-hidden select-none bg-theme-canvas text-theme-main transition-colors duration-300">
      {/* Rapido / Uber Enterprise Mobility Header Bar */}
      <header className="h-16 glass-panel border-b border-theme-border px-6 flex items-center justify-between z-30 shrink-0 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-brand-primary text-theme-canvas flex items-center justify-center font-bold shadow-md shadow-brand-primary/10">
            <Bus className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wider uppercase flex items-center gap-2 text-theme-main">
              ANITS TRANSPORT
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-brand-primary/20 text-brand-primary font-mono font-bold border border-brand-primary/30">
                PRO DISPATCH
              </span>
            </h1>
            <p className="text-[11px] text-theme-muted font-mono">Real-Time Fleet Intelligence Engine</p>
          </div>
        </div>

        {/* Live Status HUD & Navigation Controls */}
        <div className="flex items-center gap-3 md:gap-4 font-mono text-xs">

          {/* SSE Connectivity Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-theme-card border border-theme-border text-theme-main shadow-sm">
            <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-status-active animate-pulse' : 'text-status-delayed'}`} />
            <span className="text-theme-muted">SSE Link:</span>
            <span className={isConnected ? 'text-status-active font-bold' : 'text-status-delayed font-bold'}>
              {isConnected ? `LIVE ${latencyMs ?? 16}ms` : streamStatus}
            </span>
          </div>

          {/* Clock */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-theme-card border border-theme-border text-theme-muted">
            <Clock className="w-3.5 h-3.5 text-brand-primary" />
            <span className="text-theme-main font-semibold">{currentTime || '00:00:00'}</span>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen App Mode'}
            className="p-2.5 rounded-xl bg-theme-card hover:bg-theme-hover border border-theme-border text-theme-main transition-all cursor-pointer flex items-center gap-1.5"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-brand-primary" /> : <Maximize2 className="w-4 h-4 text-brand-primary" />}
            <span className="hidden md:inline font-mono">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Rider Light Theme' : 'Captain Dark Theme'}`}
            className="p-2.5 rounded-xl bg-theme-card hover:bg-theme-hover border border-theme-border text-theme-main transition-all cursor-pointer flex items-center gap-1.5"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-brand-primary" />
                <span className="hidden sm:inline font-mono text-theme-main">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-brand-primary" />
                <span className="hidden sm:inline font-mono text-theme-main">Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Map Viewport */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* WebGL Fleet Canvas Engine */}
        <FleetCanvas
          geoJsonData={interpolatedGeoJson}
          onVehicleSelect={(veh) => setSelectedBusId(veh?.busId || null)}
          selectedBusId={selectedBusId}
          latencyMs={latencyMs}
          streamStatus={streamStatus}
          theme={theme}
        />

        {/* Selected Vehicle Rapido/Uber Style Details Drawer */}
        {selectedVehicleProps && (
          <aside className="absolute top-4 left-4 z-20 w-84 glass-panel-glow rounded-2xl p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-200 shadow-2xl border border-brand-primary/30">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-theme-border pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex h-3 w-3 shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedVehicleProps.status === 'SOS' ? 'bg-status-sos' : 'bg-status-active'
                    }`} />
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${selectedVehicleProps.status === 'SOS' ? 'bg-status-sos' : 'bg-status-active'
                    }`} />
                </div>
                <div>
                  <h2 className="font-mono text-base font-extrabold text-theme-main">
                    {selectedVehicleProps.plateNumber || `BUS-${selectedVehicleProps.busId.slice(0, 4).toUpperCase()}`}
                  </h2>
                  <span className="text-[10px] text-theme-muted font-mono">
                    ID: {selectedVehicleProps.busId.slice(0, 8)}...
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBusId(null)}
                className="opacity-80 hover:opacity-100 text-xs font-mono px-2.5 py-1 rounded-lg bg-theme-hover hover:bg-slate-700 text-theme-main cursor-pointer border border-theme-border"
              >
              <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid Metrics */}
            <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
              <div className="bg-theme-card p-3 rounded-xl border border-theme-border">
                <span className="text-[10px] text-theme-muted block mb-1 uppercase font-semibold flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-brand-primary" /> Speed
                </span>
                <span className="text-lg font-extrabold text-brand-primary tabular-nums">
                  {selectedVehicleProps.speed}{' '}
                  <span className="text-xs font-normal text-theme-muted">km/h</span>
                </span>
              </div>

              <div className="bg-theme-card p-3 rounded-xl border border-theme-border">
                <span className="text-[10px] text-theme-muted block mb-1 uppercase font-semibold flex items-center gap-1">
                  <Compass className="w-3 h-3 text-brand-primary" /> Heading
                </span>
                <span className="text-lg font-extrabold tabular-nums text-theme-main">
                  {selectedVehicleProps.heading}°
                </span>
              </div>

              <div className="bg-theme-card p-3 rounded-xl border border-theme-border col-span-2">
                <div className="flex items-center justify-between text-[10px] text-theme-muted mb-1.5 font-semibold uppercase">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-brand-primary" /> Passenger Occupancy
                  </span>
                  <span className="text-theme-main font-bold tabular-nums">
                    {passengerCount} / {capacity} ({occupancyPct}%)
                  </span>
                </div>
                {/* Visual Occupancy Progress Bar */}
                <div className="w-full bg-theme-hover h-2 rounded-full overflow-hidden border border-theme-border">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${occupancyPct >= 90 ? 'bg-status-sos' : occupancyPct >= 75 ? 'bg-status-delayed' : 'bg-brand-primary'
                      }`}
                    style={{ width: `${occupancyPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Assigned Route */}
            <div className="bg-theme-card p-3 rounded-xl border border-theme-border text-xs font-mono space-y-1">
              <span className="text-[10px] text-theme-muted block uppercase font-semibold">Assigned Route</span>
              <p className="text-brand-primary font-bold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                {selectedVehicleProps.routeName || `Sector ${selectedVehicleProps.routeId.slice(0, 4).toUpperCase()} Express`}
              </p>
            </div>

            {/* GPS Position */}
            {selectedVehicleCoords && (
              <div className="bg-theme-card p-2.5 rounded-xl border border-theme-border text-[11px] font-mono flex items-center justify-between opacity-90">
                <span className="flex items-center gap-1 text-theme-muted">
                  <Navigation className="w-3 h-3 text-status-active" />
                  GPS Coord:
                </span>
                <span className="tabular-nums font-bold text-theme-main">
                  {selectedVehicleCoords[1].toFixed(5)}, {selectedVehicleCoords[0].toFixed(5)}
                </span>
              </div>
            )}
          </aside>
        )}

        {/* Bottom Fleet Status Metrics Bar */}
        <div className="absolute bottom-4 left-4 right-16 z-20 glass-panel p-3 rounded-2xl flex items-center justify-between font-mono text-xs border border-theme-border shadow-xl">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-primary" />
              <span className="text-theme-muted">Active Fleet:</span>
              <span className="font-extrabold text-theme-main tabular-nums">{interpolatedGeoJson.features.length} Buses</span>
            </div>

            <div className="h-4 w-px bg-theme-border" />

            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-status-delayed" />
              <span className="text-theme-muted">Emergency SOS:</span>
              <span className="text-status-sos font-extrabold tabular-nums">
                {interpolatedGeoJson.features.filter((f) => f.properties.status === 'SOS').length} Active
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
