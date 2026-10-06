import React, { useState, useEffect } from 'react';
import {
  Bus,
  Gauge,
  Compass,
  Users,
  MapPin,
  Navigation,
  Activity,
  Maximize2,
  Minimize2,
  X,
  Radio,
  Clock,
  Sun,
  Moon,
} from 'lucide-react';
import { useTelemetryStream } from './hooks/useTelemetryStream';
import { useFleetInterpolation } from './hooks/useFleetInterpolation';
import FleetCanvas from './components/map/FleetCanvas';

export const App: React.FC = () => {
  const { geoJsonData, isConnected, status: streamStatus, latencyMs } = useTelemetryStream();
  const interpolatedGeoJson = useFleetInterpolation(geoJsonData);

  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ats_theme') as 'dark' | 'light') || 'dark';
  });

  // Keep live digital clock updating
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Theme Synchronizer
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ats_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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

  // Find currently selected vehicle feature & properties
  const selectedFeature = interpolatedGeoJson.features.find(
    (f) => f.properties.busId === selectedBusId
  );
  const selectedVehicleProps = selectedFeature?.properties;
  const selectedVehicleCoords = selectedFeature?.geometry?.coordinates;

  const capacity = selectedVehicleProps?.capacity || 55;
  const passengerCount = selectedVehicleProps?.passengerCount || 38;
  const occupancyPct = Math.round((passengerCount / capacity) * 100);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-theme-canvas text-theme-main font-sans selection:bg-brand-primary/30 selection:text-brand-primary">
      {/* Top Professional Navigation & Telemetry HUD Header */}
      <header className="z-30 px-4 py-3 glass-panel border-b border-theme-border flex items-center justify-between shadow-xl font-sans">
        <div className="flex items-center gap-3 font-sans">
          <div className="p-2 rounded-xl bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
            <Bus className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wider uppercase flex items-center gap-2 text-theme-main font-sans">
              ANITS TRANSPORT
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-brand-primary/20 text-brand-primary font-mono font-bold border border-brand-primary/30">
                PRO DISPATCH
              </span>
            </h1>
            <p className="text-[11px] text-theme-muted font-sans font-medium">Real-Time Fleet Intelligence Engine</p>
          </div>
        </div>

        {/* Live Status HUD & Navigation Controls */}
        <div className="flex items-center gap-3 md:gap-4 text-xs font-sans">
          {/* SSE Connectivity Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-theme-card border border-theme-border text-theme-main shadow-sm font-sans">
            <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-status-active animate-pulse' : 'text-status-delayed'}`} />
            <span className="text-theme-muted font-sans">SSE Link:</span>
            <span className={`font-mono tabular-nums ${isConnected ? 'text-status-active font-bold' : 'text-status-delayed font-bold'}`}>
              {isConnected ? `LIVE ${latencyMs ?? 16}ms` : streamStatus}
            </span>
          </div>

          {/* Clock */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-theme-card border border-theme-border text-theme-muted font-sans">
            <Clock className="w-3.5 h-3.5 text-brand-primary" />
            <span className="text-theme-main font-semibold font-mono tabular-nums">{currentTime || '00:00:00'}</span>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen App Mode'}
            className="p-2.5 rounded-xl bg-theme-card hover:bg-theme-hover border border-theme-border text-theme-main transition-all cursor-pointer flex items-center gap-1.5 font-sans"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-brand-primary" /> : <Maximize2 className="w-4 h-4 text-brand-primary" />}
            <span className="hidden md:inline font-sans font-medium">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Rider Light Theme' : 'Captain Dark Theme'}`}
            className="p-2.5 rounded-xl bg-theme-card hover:bg-theme-hover border border-theme-border text-theme-main transition-all cursor-pointer flex items-center gap-1.5 font-sans"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-brand-primary" />
                <span className="hidden sm:inline font-sans text-theme-main font-medium">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-brand-primary" />
                <span className="hidden sm:inline font-sans text-theme-main font-medium">Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Map Viewport */}
      <div className="relative flex-1 w-full h-full overflow-hidden font-sans">
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
          <aside className="absolute top-4 left-4 z-20 w-84 glass-panel-glow rounded-2xl p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-200 shadow-2xl border border-brand-primary/30 font-sans">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-theme-border pb-3 font-sans">
              <div className="flex items-center gap-3 font-sans">
                <div className="relative flex h-3 w-3 shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${selectedVehicleProps.status === 'SOS' ? 'bg-status-sos' : 'bg-status-active'
                    }`} />
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${selectedVehicleProps.status === 'SOS' ? 'bg-status-sos' : 'bg-status-active'
                    }`} />
                </div>
                <div>
                  <h2 className="font-sans text-base font-extrabold text-theme-main">
                    {selectedVehicleProps.plateNumber || `BUS-${selectedVehicleProps.busId.slice(0, 4).toUpperCase()}`}
                  </h2>
                  <span className="text-[10px] text-theme-muted font-mono">
                    ID: {selectedVehicleProps.busId.slice(0, 8)}...
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBusId(null)}
                className="opacity-80 hover:opacity-100 text-xs font-sans px-2.5 py-1 rounded-lg bg-theme-hover hover:bg-slate-700 text-theme-main cursor-pointer border border-theme-border"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid Metrics */}
            <div className="grid grid-cols-2 gap-2.5 font-sans text-xs">
              <div className="bg-theme-card p-3 rounded-xl border border-theme-border">
                <span className="text-[10px] text-theme-muted block mb-1 uppercase font-semibold flex items-center gap-1 font-sans">
                  <Gauge className="w-3 h-3 text-brand-primary" /> Speed
                </span>
                <span className="text-lg font-extrabold text-brand-primary font-mono tabular-nums">
                  {selectedVehicleProps.speed}{' '}
                  <span className="text-xs font-normal text-theme-muted font-sans">km/h</span>
                </span>
              </div>

              <div className="bg-theme-card p-3 rounded-xl border border-theme-border">
                <span className="text-[10px] text-theme-muted block mb-1 uppercase font-semibold flex items-center gap-1 font-sans">
                  <Compass className="w-3 h-3 text-brand-primary" /> Heading
                </span>
                <span className="text-lg font-extrabold font-mono tabular-nums text-theme-main">
                  {selectedVehicleProps.heading}°
                </span>
              </div>

              <div className="bg-theme-card p-3 rounded-xl border border-theme-border col-span-2">
                <div className="flex items-center justify-between text-[10px] text-theme-muted mb-1.5 font-semibold uppercase font-sans">
                  <span className="flex items-center gap-1 font-sans">
                    <Users className="w-3 h-3 text-brand-primary" /> Passenger Occupancy
                  </span>
                  <span className="text-theme-main font-bold font-mono tabular-nums">
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
            <div className="bg-theme-card p-3 rounded-xl border border-theme-border text-xs font-sans space-y-1">
              <span className="text-[10px] text-theme-muted block uppercase font-semibold font-sans">Assigned Route</span>
              <p className="text-brand-primary font-bold flex items-center gap-1.5 font-sans">
                <MapPin className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                {selectedVehicleProps.routeName || `Sector ${selectedVehicleProps.routeId.slice(0, 4).toUpperCase()} Express`}
              </p>
            </div>

            {/* GPS Position */}
            {selectedVehicleCoords && (
              <div className="bg-theme-card p-2.5 rounded-xl border border-theme-border text-[11px] font-sans flex items-center justify-between opacity-90">
                <span className="flex items-center gap-1 text-theme-muted font-sans">
                  <Navigation className="w-3 h-3 text-status-active" />
                  GPS Coord:
                </span>
                <span className="font-mono tabular-nums font-bold text-theme-main">
                  {selectedVehicleCoords[1].toFixed(5)}, {selectedVehicleCoords[0].toFixed(5)}
                </span>
              </div>
            )}
          </aside>
        )}

        {/* Bottom Fleet Status Metrics Bar */}
        <div className="absolute bottom-4 left-4 right-16 z-20 glass-panel p-3 rounded-2xl flex items-center justify-between font-sans text-xs border border-theme-border shadow-xl">
          <div className="flex items-center gap-6 font-sans">
            <div className="flex items-center gap-2 font-sans">
              <Activity className="w-4 h-4 text-brand-primary" />
              <span className="text-theme-muted font-sans">Active Fleet:</span>
              <span className="font-extrabold text-theme-main font-mono tabular-nums">{interpolatedGeoJson.features.length} Buses</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-theme-muted font-sans">
              <span>Map Mode:</span>
              <span className="text-brand-primary font-bold font-sans">WebGL Canvas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
