import React, { useState, useEffect } from 'react';
import { FleetCanvas, VehicleFeatureProperties } from './components/map/FleetCanvas';
import { useTelemetryStream } from './hooks/useTelemetryStream';
import { useFleetInterpolation } from './hooks/useFleetInterpolation';
import { MobileHeader } from './components/mobile/MobileHeader';
import { RideStatusSheet } from './components/mobile/RideStatusSheet';
import { MobileNavBar, NavTab } from './components/mobile/MobileNavBar';
import { RoutesDirectoryView } from './components/mobile/RoutesDirectoryView';
import { SettingsView } from './components/mobile/SettingsView';
import { RotateCcw, Bus } from 'lucide-react';

export const App: React.FC = () => {
  // Navigation & Screen Mode State
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Theme Management (Default Dark Obsidian)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ats_theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 1. Hook: Manage Fastify Server-Sent Events (SSE) telemetry connection
  const { geoJsonData: rawGeoJson, status: streamStatus, latencyMs, isConnected } = useTelemetryStream();

  // 2. Hook: 60 FPS WebGL Linear Interpolation (LERP) movement smoothing
  const interpolatedGeoJson = useFleetInterpolation(rawGeoJson, {
    defaultDurationMs: 5000,
  });

  // Dynamically extract the selected vehicle feature
  const selectedFeature = interpolatedGeoJson.features.find(
    (f) => f.properties.busId === selectedBusId
  );
  const selectedVehicleProps: VehicleFeatureProperties | null = selectedFeature
    ? (selectedFeature.properties as VehicleFeatureProperties)
    : null;

  // Filtered vehicles for live search
  const filteredVehicles = searchQuery.trim()
    ? interpolatedGeoJson.features.filter((f) => {
        const query = searchQuery.toLowerCase();
        const plate = (f.properties.plateNumber || '').toLowerCase();
        const busId = (f.properties.busId || '').toLowerCase();
        const routeName = (f.properties.routeName || '').toLowerCase();
        return plate.includes(query) || busId.includes(query) || routeName.includes(query);
      })
    : [];

  // Handler: Selecting a bus (from map, search, or corridor directory)
  const handleSelectBus = (vehicle: VehicleFeatureProperties | null) => {
    if (!vehicle) {
      setSelectedBusId(null);
      setActiveTab('home');
      return;
    }
    setSelectedBusId(vehicle.busId);
    setSearchQuery('');
    setActiveTab('mybus'); // Automatically highlights 'My Bus' tab in the footer!
  };

  // Handler: User clicks Back to global fleet
  const handleBackToHome = () => {
    setSelectedBusId(null);
    setActiveTab('home'); // Footer returns to 'Home' as active tab!
  };

  // Handler: Tapping footer navigation tabs
  const handleTabChange = (tab: NavTab) => {
    setActiveTab(tab);

    if (tab === 'home') {
      // Removing focus returns to global fleet map overview
      setSelectedBusId(null);
    } else if (tab === 'mybus') {
      // If no bus selected yet, pick the first active bus or preserve current selection
      if (!selectedBusId && interpolatedGeoJson.features.length > 0) {
        const firstBus = interpolatedGeoJson.features[0]?.properties as VehicleFeatureProperties;
        if (firstBus) {
          setSelectedBusId(firstBus.busId);
        }
      }
    }
  };

  // Handler: Selecting a corridor from the Routes view
  const handleSelectRouteBus = (routeId: string) => {
    const matchingFeature = interpolatedGeoJson.features.find(
      (f) => f.properties.routeId === routeId
    );
    if (matchingFeature) {
      handleSelectBus(matchingFeature.properties as VehicleFeatureProperties);
    } else if (interpolatedGeoJson.features.length > 0) {
      handleSelectBus(interpolatedGeoJson.features[0]?.properties as VehicleFeatureProperties);
    }
  };

  // Handler: Reset Preferences & State
  const handleResetPreferences = () => {
    setSelectedBusId(null);
    setActiveTab('home');
    setSearchQuery('');
    setRecenterTrigger((prev) => prev + 1);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#090d16] text-slate-100 font-sans">
      {/* 1. Mobile Header (Dynamic Search / Greeting / In-Ride Mode) */}
      <MobileHeader
        activeTab={activeTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onBackToHome={handleBackToHome}
        selectedBusPlate={selectedVehicleProps?.plateNumber}
        selectedBusName={
          selectedVehicleProps?.plateNumber
            ? `${selectedVehicleProps.plateNumber}`
            : selectedBusId
            ? `BUS-${selectedBusId.slice(0, 4).toUpperCase()}`
            : undefined
        }
        selectedRouteName={selectedVehicleProps?.routeName}
        latencyMs={latencyMs}
        isConnected={isConnected}
        totalBusesCount={interpolatedGeoJson.features.length}
      />

      {/* Search Results Dropdown List (If search query active in Home mode) */}
      {activeTab === 'home' && searchQuery.trim() && (
        <div className="fixed top-28 left-4 right-4 z-40 max-w-md mx-auto bg-slate-900/95 border border-slate-800 rounded-2xl p-2 shadow-2xl backdrop-blur-xl space-y-1 max-h-60 overflow-y-auto animate-fade-in">
          {filteredVehicles.length > 0 ? (
            filteredVehicles.map((f) => {
              const p = f.properties;
              return (
                <button
                  key={p.busId}
                  onClick={() => handleSelectBus(p as VehicleFeatureProperties)}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Bus className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-extrabold text-white block">
                        {p.plateNumber || `BUS-${p.busId.slice(0, 4)}`}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {p.routeName || 'Campus Corridor'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                    {p.speed || 35} km/h
                  </span>
                </button>
              );
            })
          ) : (
            <div className="p-4 text-center text-xs text-slate-400 font-mono">
              No active buses matching "{searchQuery}"
            </div>
          )}
        </div>
      )}

      {/* 2. Full-Bleed MapLibre WebGL Canvas (Underlying Base Layer) */}
      <div className="absolute inset-0 w-full h-full z-0">
        <FleetCanvas
          geoJsonData={interpolatedGeoJson}
          onVehicleSelect={handleSelectBus}
          selectedBusId={selectedBusId}
          latencyMs={latencyMs}
          streamStatus={streamStatus}
          theme={theme}
          hideDropdown={true} // Clean mobile canvas without desktop dropdowns
          recenterTrigger={recenterTrigger}
        />
      </div>

      {/* Floating Recenter Button (FlightRadar24 / Uber Style) */}
      {activeTab !== 'routes' && activeTab !== 'settings' && (
        <div
          className={`fixed right-4 z-20 transition-all duration-300 ${
            selectedVehicleProps && activeTab === 'mybus' ? 'bottom-52' : 'bottom-20'
          }`}
        >
          <button
            onClick={() => setRecenterTrigger((prev) => prev + 1)}
            title="Recenter Camera on Bus"
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 shadow-xl backdrop-blur-md text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px]">Recenter</span>
          </button>
        </div>
      )}

      {/* 3. Multi-Snap Bottom Sheet (Active Ride Focus / My Bus Tab) */}
      {selectedVehicleProps && activeTab === 'mybus' && (
        <RideStatusSheet
          vehicle={selectedVehicleProps}
          onClose={handleBackToHome}
          onRecenter={() => setRecenterTrigger((prev) => prev + 1)}
        />
      )}

      {/* 4. Routes Directory View (When Routes Tab Active) */}
      {activeTab === 'routes' && (
        <RoutesDirectoryView
          onSelectRouteBus={handleSelectRouteBus}
          activeFeatures={interpolatedGeoJson.features}
        />
      )}

      {/* 5. Settings & Preferences View (When Settings Tab Active) */}
      {activeTab === 'settings' && (
        <SettingsView
          theme={theme}
          onToggleTheme={toggleTheme}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          latencyMs={latencyMs}
          isConnected={isConnected}
          streamStatus={streamStatus}
          onResetPreferences={handleResetPreferences}
        />
      )}

      {/* 6. Fixed Mobile Bottom Navigation Bar (Home, My Bus, Routes, Settings) */}
      <MobileNavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hasActiveBus={Boolean(selectedBusId)}
      />
    </div>
  );
};

export default App;
