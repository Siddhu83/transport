import React, { useState, useEffect } from 'react';
import { FleetCanvas, VehicleFeatureProperties } from './components/map/FleetCanvas';
import { Activity, Bus, ShieldAlert, Radio, Clock, ChevronRight } from 'lucide-react';

export const App: React.FC = () => {
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleFeatureProperties | null>(null);
  const [streamConnected, setStreamConnected] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [geoJsonData, setGeoJsonData] = useState<GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>>({
    type: 'FeatureCollection',
    features: [],
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

  // Connect to SSE stream or generate initial mock fleet data for WebGL visual validation
  useEffect(() => {
    // 1. Attempt connection to backend SSE Stream endpoint
    const eventSource = new EventSource('/api/v1/telemetry/stream');

    eventSource.onopen = () => {
      setStreamConnected(true);
    };

    eventSource.addEventListener('fleet-snapshot', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload && payload.type === 'FeatureCollection') {
          setGeoJsonData(payload);
          setStreamConnected(true);
        }
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    });

    eventSource.onerror = () => {
      setStreamConnected(false);
      // Fallback: If backend is offline during frontend build/demo, generate 60 simulated fleet buses across campus coordinates
      if (geoJsonData.features.length === 0) {
        const mockFeatures: GeoJSON.Feature<GeoJSON.Point, VehicleFeatureProperties>[] = Array.from({ length: 60 }).map((_, i) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              77.5946 + (Math.random() - 0.5) * 0.15,
              12.9716 + (Math.random() - 0.5) * 0.15,
            ],
          },
          properties: {
            busId: `bus-uuid-${i + 1}`,
            plateNumber: `KA-01-F-${1000 + i}`,
            routeId: `route-${(i % 6) + 1}`,
            routeName: `Route ${(i % 6) + 1} - ANITS`,
            speed: Math.floor(Math.random() * 45) + 15,
            heading: Math.floor(Math.random() * 360),
            status: i === 5 ? 'SOS' : i % 7 === 0 ? 'DELAYED' : 'ACTIVE',
            passengerCount: Math.floor(Math.random() * 40),
            capacity: 50,
            lastPing: new Date().toISOString(),
          },
        }));

        setGeoJsonData({
          type: 'FeatureCollection',
          features: mockFeatures,
        });
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f17] text-slate-100 font-sans overflow-hidden select-none">
      {/* Top FIDS Command Center Header */}
      <header className="h-16 glass-panel border-b border-slate-800/80 px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-glow">
            <Bus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase flex items-center gap-2">
              ANITS TRANSPORT SYSTEM
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-normal">
                ATS (v1.0)
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">Real-Time Telemetry & Dispatch Engine</p>
          </div>
        </div>

        {/* Live System Status HUD */}
        <div className="flex items-center gap-6">
          {/* SSE Connectivity Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 font-mono text-xs">
            <Radio className={`w-3.5 h-3.5 ${streamConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span className="text-slate-400">SSE Stream:</span>
            <span className={streamConnected ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {streamConnected ? 'CONNECTED (500ms)' : 'STANDBY / MOCK'}
            </span>
          </div>

          {/* Clock */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 font-mono text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{currentTime || '00:00:00'} IST</span>
          </div>
        </div>
      </header>

      {/* Main Viewport Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        {/* WebGL Maplibre Canvas Engine */}
        <FleetCanvas
          geoJsonData={geoJsonData}
          onVehicleSelect={setSelectedVehicle}
          selectedBusId={selectedVehicle?.busId}
        />

        {/* Floating Sidebar Details Drawer (FIDS Aesthetic) */}
        {selectedVehicle && (
          <aside className="absolute top-4 left-4 z-20 w-80 glass-panel-glow rounded-xl p-5 text-slate-100 flex flex-col gap-4 animate-in fade-in slide-in-from-left-4 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <h2 className="font-mono text-sm font-bold text-slate-100">{selectedVehicle.plateNumber}</h2>
              </div>
              <button
                onClick={() => setSelectedVehicle(null)}
                className="text-slate-400 hover:text-slate-100 text-xs font-mono px-2 py-1 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer"
              >
                ESC
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-1">SPEED</span>
                <span className="text-lg font-bold text-cyan-400 tabular-nums">{selectedVehicle.speed} <span className="text-xs font-normal text-slate-400">km/h</span></span>
              </div>
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-1">HEADING</span>
                <span className="text-lg font-bold text-slate-200 tabular-nums">{selectedVehicle.heading}°</span>
              </div>
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-1">STATUS</span>
                <span className={`text-xs font-bold ${selectedVehicle.status === 'SOS' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {selectedVehicle.status}
                </span>
              </div>
              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-1">OCCUPANCY</span>
                <span className="text-xs font-bold text-slate-200 tabular-nums">
                  {selectedVehicle.passengerCount ?? 28} / {selectedVehicle.capacity ?? 50}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 text-xs font-mono">
              <span className="text-[10px] text-slate-400 block mb-1">ASSIGNED ROUTE</span>
              <p className="text-cyan-300 font-semibold">{selectedVehicle.routeName || selectedVehicle.routeId}</p>
            </div>
          </aside>
        )}

        {/* Bottom Fleet Telemetry Metrics Bar */}
        <div className="absolute bottom-4 left-4 right-16 z-20 glass-panel p-3 rounded-xl flex items-center justify-between font-mono text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-400">Total Active Fleet:</span>
              <span className="text-slate-100 font-bold tabular-nums">{geoJsonData.features.length} Buses</span>
            </div>

            <div className="h-4 w-px bg-slate-800" />

            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400">Active Incidents:</span>
              <span className="text-amber-400 font-bold tabular-nums">
                {geoJsonData.features.filter((f) => f.properties.status === 'SOS').length} SOS
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>MapLibre GL WebGL 2.0 Engine</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-cyan-400 font-semibold">Zero DOM Markers</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
