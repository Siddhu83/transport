import React, { useState, useEffect } from 'react';
import { FleetCanvas, VehicleFeatureProperties } from './components/map/FleetCanvas';
import { useTelemetryStream } from './hooks/useTelemetryStream';
import { useFleetInterpolation } from './hooks/useFleetInterpolation';
import { Activity, Bus, ShieldAlert, Radio, Clock, ChevronRight, Zap, Sun, Moon, Maximize2, Minimize2 } from 'lucide-react';

export const App: React.FC = () => {
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleFeatureProperties | null>(null);
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
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 1. Hook: Manage SSE stream connection & latency tracking
  const { geoJsonData: rawGeoJson, status: streamStatus, latencyMs, isConnected } = useTelemetryStream();

  // 2. Hook: 60 FPS Linear Interpolation (LERP) movement & shortest-path heading engine
  const interpolatedGeoJson = useFleetInterpolation(rawGeoJson, {
    interpolationDurationMs: 500,
  });

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

  return (
    <div className={`flex flex-col h-screen w-screen font-sans overflow-hidden select-none transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0b0f17] text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      {/* Top FIDS Command Center Header */}
      <header className="h-16 glass-panel border-b px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-500 shadow-glow">
            <Bus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase flex items-center gap-2">
              ANITS TRANSPORT SYSTEM
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-500 font-mono font-normal">
                ATS (v1.0)
              </span>
            </h1>
            <p className="text-[11px] opacity-70 font-mono">Real-Time Telemetry & Dispatch Engine</p>
          </div>
        </div>

        {/* Live System Status HUD & Theme Controls */}
        <div className="flex items-center gap-3 md:gap-5">
          {/* 60 FPS LERP Engine Status Pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 font-mono text-xs">
            <Zap className="w-3.5 h-3.5 text-cyan-500 animate-pulse" />
            <span className="opacity-70">LERP Engine:</span>
            <span className="text-cyan-500 font-semibold tabular-nums">60 FPS Smooth</span>
          </div>

          {/* SSE Connectivity Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 font-mono text-xs">
            <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-500 animate-pulse' : 'text-amber-500'}`} />
            <span className="opacity-70">SSE Stream:</span>
            <span className={isConnected ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>
              {isConnected ? 'CONNECTED (500ms)' : streamStatus}
            </span>
          </div>

          {/* Clock */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-500/10 border border-slate-500/20 font-mono text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 text-cyan-500" />
            <span className="text-current">{currentTime || '00:00:00'} IST</span>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen App Mode'}
            className="p-2 rounded-lg bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-cyan-500 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-cyan-400" /> : <Maximize2 className="w-4 h-4 text-cyan-400" />}
            <span className="hidden md:inline text-current">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Vibrant Light Mode (Voyager)' : 'Dark Mode (Obsidian)'}`}
            className="p-2 rounded-lg bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-cyan-500 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline text-slate-300">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-cyan-600" />
                <span className="hidden sm:inline text-slate-700">Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* WebGL Maplibre Canvas Engine */}
        <FleetCanvas
          geoJsonData={interpolatedGeoJson}
          onVehicleSelect={setSelectedVehicle}
          selectedBusId={selectedVehicle?.busId}
          latencyMs={latencyMs}
          streamStatus={streamStatus}
          theme={theme}
        />

        {/* Floating Sidebar Details Drawer (FIDS Aesthetic) */}
        {selectedVehicle && (
          <aside className="absolute top-4 left-4 z-20 w-80 glass-panel-glow rounded-xl p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-200">
            <div className="flex items-center justify-between border-b border-slate-500/20 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <h2 className="font-mono text-sm font-bold">{selectedVehicle.plateNumber}</h2>
              </div>
              <button
                onClick={() => setSelectedVehicle(null)}
                className="opacity-70 hover:opacity-100 text-xs font-mono px-2 py-1 rounded bg-slate-500/10 hover:bg-slate-500/20 cursor-pointer"
              >
                ESC
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="bg-slate-500/5 p-2.5 rounded-lg border border-slate-500/20">
                <span className="text-[10px] opacity-70 block mb-1">SPEED</span>
                <span className="text-lg font-bold text-cyan-500 tabular-nums">{selectedVehicle.speed} <span className="text-xs font-normal opacity-70">km/h</span></span>
              </div>
              <div className="bg-slate-500/5 p-2.5 rounded-lg border border-slate-500/20">
                <span className="text-[10px] opacity-70 block mb-1">HEADING</span>
                <span className="text-lg font-bold tabular-nums">{selectedVehicle.heading}°</span>
              </div>
              <div className="bg-slate-500/5 p-2.5 rounded-lg border border-slate-500/20">
                <span className="text-[10px] opacity-70 block mb-1">STATUS</span>
                <span className={`text-xs font-bold ${selectedVehicle.status === 'SOS' ? 'text-red-500' : 'text-emerald-500'}`}>
                  {selectedVehicle.status}
                </span>
              </div>
              <div className="bg-slate-500/5 p-2.5 rounded-lg border border-slate-500/20">
                <span className="text-[10px] opacity-70 block mb-1">OCCUPANCY</span>
                <span className="text-xs font-bold tabular-nums">
                  {selectedVehicle.passengerCount ?? 28} / {selectedVehicle.capacity ?? 50}
                </span>
              </div>
            </div>

            <div className="bg-slate-500/5 p-3 rounded-lg border border-slate-500/20 text-xs font-mono">
              <span className="text-[10px] opacity-70 block mb-1">ASSIGNED ROUTE</span>
              <p className="text-cyan-500 font-semibold">{selectedVehicle.routeName || selectedVehicle.routeId}</p>
            </div>
          </aside>
        )}

        {/* Bottom Fleet Telemetry Metrics Bar */}
        <div className="absolute bottom-4 left-4 right-16 z-20 glass-panel p-3 rounded-xl flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-500" />
              <span className="opacity-70">Total Active Fleet:</span>
              <span className="font-bold tabular-nums">{interpolatedGeoJson.features.length} Buses</span>
            </div>

            <div className="h-4 w-px bg-slate-500/20" />

            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span className="opacity-70">Active Incidents:</span>
              <span className="text-amber-500 font-bold tabular-nums">
                {interpolatedGeoJson.features.filter((f) => f.properties.status === 'SOS').length} SOS
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] opacity-70">
            <span>MapLibre GL WebGL Engine</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-cyan-500 font-semibold uppercase">{theme} MODE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
