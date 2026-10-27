import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  ShieldAlert,
  Bus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Users,
  Gauge,
  Plus,
  Minus,
  RotateCcw,
  Flame,
  ExternalLink,
  SlidersHorizontal,
  Compass,
} from 'lucide-react';
import { useTelemetryStream } from '../../hooks/useTelemetryStream';
import { useFleetInterpolation } from '../../hooks/useFleetInterpolation';
import { VehicleFeatureProperties } from '../../components/map/FleetCanvas';

// Geodesic circle generator for 5km SOS incident perimeter
function createGeoJsonCircle(
  center: [number, number],
  radiusKm: number,
  points: number = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const [lng, lat] = center;
  const distanceX = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([lng + x, lat + y]);
  }
  coords.push(coords[0]!); // close polygon

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: {
      radiusKm,
    },
  };
}

// Active SOS Incident Interface
export interface ActiveSosIncident {
  id: string;
  busId: string;
  plateNumber: string;
  routeId: string;
  routeName: string;
  driverName: string;
  driverPhone: string;
  latitude: number;
  longitude: number;
  reason: 'MECHANICAL_BREAKDOWN' | 'ACCIDENT' | 'MEDICAL_EMERGENCY' | 'ROAD_BLOCKED' | 'OTHER';
  strandedPassengerBand: 'BAND_A_UNDER_15' | 'BAND_B_15_TO_30' | 'BAND_C_30_TO_50' | 'BAND_D_OVER_50';
  passengerCount: number;
  status: 'OPEN' | 'DISPATCHED' | 'RESOLVED';
  dispatchedReliefBusId?: string;
  dispatchedReliefBusPlate?: string;
  triggeredAt: number;
  notes?: string;
}

export const ControlTower: React.FC = () => {
  const navigate = useNavigate();

  // Map Refs & State
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Telemetry SSE Ingestion & LERP Smoothing
  const { geoJsonData: rawGeoJson, latencyMs, isConnected } = useTelemetryStream();
  const interpolatedGeoJson = useFleetInterpolation(rawGeoJson, { defaultDurationMs: 4000 });

  // UI State
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NOMINAL' | 'DELAYED' | 'EMERGENCY'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  // Active SOS Incident State (Simulated or Real-time from Backend)
  const [activeIncident, setActiveIncident] = useState<ActiveSosIncident | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  // Timer for active incident
  useEffect(() => {
    if (!activeIncident || activeIncident.status === 'RESOLVED') {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeIncident]);

  // Format Elapsed Time MM:SS
  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Convert raw/interpolated vehicles to typed array
  const vehicles: VehicleFeatureProperties[] = useMemo(() => {
    return interpolatedGeoJson.features.map((f) => f.properties as VehicleFeatureProperties);
  }, [interpolatedGeoJson]);

  // Metric Summaries
  const metrics = useMemo(() => {
    const total = vehicles.length;
    const emergency = vehicles.filter((v) => v.status === 'SOS').length + (activeIncident ? 1 : 0);
    const delayed = vehicles.filter((v) => v.status === 'DELAYED').length;
    const nominal = Math.max(0, total - emergency - delayed);
    return { total, nominal, delayed, emergency };
  }, [vehicles, activeIncident]);

  // Filtered vehicles for sidebar roster
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesSearch =
        (v.plateNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.busId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.routeName || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'NOMINAL') return v.status === 'ACTIVE';
      if (statusFilter === 'DELAYED') return v.status === 'DELAYED';
      if (statusFilter === 'EMERGENCY') return v.status === 'SOS' || v.busId === activeIncident?.busId;

      return true;
    });
  }, [vehicles, searchQuery, statusFilter, activeIncident]);

  // Calculate Candidate Relief Buses within 5km of breakdown
  const candidateReliefBuses = useMemo(() => {
    if (!activeIncident) return [];

    return vehicles
      .filter((v) => v.busId !== activeIncident.busId && v.status !== 'SOS')
      .map((v) => {
        // Find coordinate in geoJson
        const feat = interpolatedGeoJson.features.find((f) => f.properties.busId === v.busId);
        const [vLng, vLat] = feat ? (feat.geometry.coordinates as [number, number]) : [0, 0];

        // Haversine distance
        const R = 6371; // km
        const dLat = ((vLat - activeIncident.latitude) * Math.PI) / 180;
        const dLon = ((vLng - activeIncident.longitude) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((activeIncident.latitude * Math.PI) / 180) *
            Math.cos((vLat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = Math.round(R * c * 100) / 100;

        // Realistic ETA in minutes
        const speed = Math.max(15, v.speed || 30);
        const etaMinutes = Math.max(2, Math.round((distanceKm / speed) * 60));

        const capacity = v.capacity || 55;
        const passengerCount = v.passengerCount || 30;
        const vacantSeats = Math.max(0, capacity - passengerCount);

        return {
          busId: v.busId,
          plateNumber: v.plateNumber || `BUS-${v.busId.slice(0, 4).toUpperCase()}`,
          routeName: v.routeName || 'Campus Corridor',
          distanceKm,
          etaMinutes,
          speed,
          vacantSeats,
          capacity,
          coordinates: [vLng, vLat] as [number, number],
        };
      })
      .filter((c) => c.distanceKm <= 5.0) // Within 5km radius
      .sort((a, b) => a.distanceKm - b.distanceKm); // Closest first
  }, [activeIncident, vehicles, interpolatedGeoJson]);

  // 1. Initialize MapLibre GL JS Engine
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [83.4215, 17.9045], // ANITS Campus Tagarapuvalasa
      zoom: 12.8,
      pitch: 25,
      bearing: 0,
      attributionControl: false,
    });

    map.on('load', () => {
      // 1. Vehicles Vector Source (WebGL Symbol Layer - Zero DOM Markers)
      map.addSource('admin-buses-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Bus Glow Ring Layer
      map.addLayer({
        id: 'admin-bus-glow',
        type: 'circle',
        source: 'admin-buses-source',
        paint: {
          'circle-radius': 14,
          'circle-color': [
            'case',
            ['==', ['get', 'status'], 'SOS'],
            '#ef4444',
            ['==', ['get', 'status'], 'DELAYED'],
            '#f59e0b',
            '#10b981',
          ],
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      });

      // Bus Core Circle Layer
      map.addLayer({
        id: 'admin-bus-circle',
        type: 'circle',
        source: 'admin-buses-source',
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'case',
            ['==', ['get', 'status'], 'SOS'],
            '#ef4444',
            ['==', ['get', 'status'], 'DELAYED'],
            '#f59e0b',
            '#10b981',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0b0f17',
        },
      });

      // Bus Label Layer
      map.addLayer({
        id: 'admin-bus-label',
        type: 'symbol',
        source: 'admin-buses-source',
        layout: {
          'text-field': ['get', 'plateNumber'],
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#f8fafc',
          'text-halo-color': '#0b0f17',
          'text-halo-width': 1.5,
        },
      });

      // 2. SOS 5km Radius Circle Layer
      map.addSource('sos-radius-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'sos-radius-fill',
        type: 'fill',
        source: 'sos-radius-source',
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.08,
        },
      });

      map.addLayer({
        id: 'sos-radius-line',
        type: 'line',
        source: 'sos-radius-source',
        paint: {
          'line-color': '#ef4444',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });

      // 3. SOS Incident Center Pulsing Marker Source
      map.addSource('sos-incident-point-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'sos-incident-pulse',
        type: 'circle',
        source: 'sos-incident-point-source',
        paint: {
          'circle-radius': 24,
          'circle-color': '#ef4444',
          'circle-opacity': 0.4,
          'circle-blur': 0.5,
        },
      });

      map.addLayer({
        id: 'sos-incident-center',
        type: 'circle',
        source: 'sos-incident-point-source',
        paint: {
          'circle-radius': 10,
          'circle-color': '#ef4444',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Vehicle Click Interaction
      map.on('click', 'admin-bus-circle', (e) => {
        if (e.features && e.features[0]) {
          const props = e.features[0].properties as VehicleFeatureProperties;
          setSelectedBusId(props.busId);
        }
      });

      map.on('mouseenter', 'admin-bus-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'admin-bus-circle', () => {
        map.getCanvas().style.cursor = '';
      });

      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Synchronize WebGL Vehicles Data with MapLibre
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('admin-buses-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(interpolatedGeoJson);
    }
  }, [interpolatedGeoJson, mapLoaded]);

  // 3. Synchronize SOS Radius Perimeter Circle Layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const radiusSource = mapRef.current.getSource('sos-radius-source') as maplibregl.GeoJSONSource;
    const pointSource = mapRef.current.getSource('sos-incident-point-source') as maplibregl.GeoJSONSource;

    if (activeIncident && activeIncident.status !== 'RESOLVED') {
      const circleFeature = createGeoJsonCircle(
        [activeIncident.longitude, activeIncident.latitude],
        5.0
      );

      if (radiusSource) {
        radiusSource.setData({
          type: 'FeatureCollection',
          features: [circleFeature],
        });
      }

      if (pointSource) {
        pointSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [activeIncident.longitude, activeIncident.latitude],
              },
              properties: {
                busId: activeIncident.busId,
                reason: activeIncident.reason,
              },
            },
          ],
        });
      }
    } else {
      if (radiusSource) radiusSource.setData({ type: 'FeatureCollection', features: [] });
      if (pointSource) pointSource.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [activeIncident, mapLoaded]);

  // Camera Fly-To Incident Breakdown Automation
  const flyToIncident = useCallback(() => {
    if (!mapRef.current || !activeIncident) return;
    mapRef.current.flyTo({
      center: [activeIncident.longitude, activeIncident.latitude],
      zoom: 14,
      pitch: 45,
      essential: true,
      duration: 1800,
    });
  }, [activeIncident]);

  // Camera Fly-To Specific Bus
  const flyToBus = useCallback((busId: string) => {
    if (!mapRef.current) return;
    const feat = interpolatedGeoJson.features.find((f) => f.properties.busId === busId);
    if (feat) {
      const [lng, lat] = feat.geometry.coordinates as [number, number];
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 15,
        essential: true,
        duration: 1200,
      });
      setSelectedBusId(busId);
    }
  }, [interpolatedGeoJson]);

  // Trigger Mock / Test SOS Breakdown Drill
  const handleTriggerTestIncident = () => {
    // Select first active bus or fallback to campus default
    const targetBus = vehicles[0] || {
      busId: 'bus-drill-001',
      plateNumber: 'AP 39 TE 1001',
      routeId: 'r-101',
      routeName: 'Sector 1 Express Corridor',
    };

    const breakdownLng = 83.4215 + (Math.random() - 0.5) * 0.02;
    const breakdownLat = 17.9045 + (Math.random() - 0.5) * 0.02;

    const newIncident: ActiveSosIncident = {
      id: `incident-${Date.now().toString(36)}`,
      busId: targetBus.busId,
      plateNumber: targetBus.plateNumber || 'AP 39 TE 1001',
      routeId: targetBus.routeId || 'r-101',
      routeName: targetBus.routeName || 'Sector 1 Express Corridor',
      driverName: 'Srinivasa Rao',
      driverPhone: '+91 98480 22334',
      latitude: breakdownLat,
      longitude: breakdownLng,
      reason: 'MECHANICAL_BREAKDOWN',
      strandedPassengerBand: 'BAND_C_30_TO_50',
      passengerCount: 42,
      status: 'OPEN',
      triggeredAt: Date.now(),
      notes: 'Coolant hose rupture on expressway. Engine overheating, pulled to shoulder safely.',
    };

    setActiveIncident(newIncident);

    // Auto fly camera to breakdown site
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [breakdownLng, breakdownLat],
          zoom: 13.8,
          pitch: 40,
          essential: true,
          duration: 1500,
        });
      }
    }, 100);
  };

  // Authorize 1-Click Relief Diversion
  const handleAuthorizeDiversion = async (reliefBusId: string) => {
    if (!activeIncident) return;
    setIsDispatching(true);

    try {
      // In production, execute POST /api/v1/sos/:id/dispatch
      // Here simulate sub-second authorization
      await new Promise((resolve) => setTimeout(resolve, 800));

      const reliefBus = vehicles.find((v) => v.busId === reliefBusId);
      setActiveIncident((prev) =>
        prev
          ? {
              ...prev,
              status: 'DISPATCHED',
              dispatchedReliefBusId: reliefBusId,
              dispatchedReliefBusPlate: reliefBus?.plateNumber || `BUS-${reliefBusId.slice(0, 4)}`,
            }
          : null
      );
    } finally {
      setIsDispatching(false);
    }
  };

  // Mark Incident Resolved
  const handleResolveIncident = async () => {
    if (!activeIncident) return;
    // In production, execute POST /api/v1/sos/:id/resolve
    setActiveIncident(null);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#0b0f17] text-slate-100 font-sans flex">
      {/* 1. Left 360px Control Tower Sidebar */}
      <aside
        className={`relative z-20 h-full border-r border-slate-800/80 bg-[#0b0f17]/95 backdrop-blur-2xl flex flex-col transition-all duration-300 ease-out ${
          sidebarOpen ? 'w-[360px] translate-x-0' : '-translate-x-[360px] w-0 overflow-hidden'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                CONTROL TOWER
                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
                  v2.0
                </span>
              </h1>
              <p className="text-[11px] font-medium text-slate-400">Super Admin Fleet Command</p>
            </div>
          </div>

          {/* Quick Exit to Student View */}
          <button
            onClick={() => navigate('/')}
            className="text-[11px] font-semibold text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 transition-colors flex items-center gap-1 cursor-pointer"
            title="Switch to Student Mobile PWA"
          >
            <span>Student App</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Live System Status Pill */}
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="text-[11px] font-mono text-slate-300">
              {isConnected ? `STREAM LIVE (${latencyMs || 28}ms)` : 'CONNECTING...'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            {new Date().toLocaleTimeString()}
          </span>
        </div>

        {/* Fleet KPI Metric Grid */}
        <div className="p-3 grid grid-cols-4 gap-2 border-b border-slate-800/80 bg-slate-900/30 text-center">
          <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Fleet</div>
            <div className="text-base font-black text-white tabular-nums">{metrics.total}</div>
          </div>
          <div className="p-2 rounded-xl bg-emerald-950/20 border border-emerald-800/30">
            <div className="text-[10px] font-bold text-emerald-400 uppercase">Nominal</div>
            <div className="text-base font-black text-emerald-400 tabular-nums">{metrics.nominal}</div>
          </div>
          <div className="p-2 rounded-xl bg-amber-950/20 border border-amber-800/30">
            <div className="text-[10px] font-bold text-amber-400 uppercase">Stale</div>
            <div className="text-base font-black text-amber-400 tabular-nums">{metrics.delayed}</div>
          </div>
          <div
            className={`p-2 rounded-xl border ${
              metrics.emergency > 0
                ? 'bg-rose-950/40 border-rose-600/60 animate-pulse'
                : 'bg-slate-800/40 border-slate-700/40'
            }`}
          >
            <div className="text-[10px] font-bold text-rose-400 uppercase">SOS</div>
            <div className="text-base font-black text-rose-400 tabular-nums">{metrics.emergency}</div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="p-3 space-y-2 border-b border-slate-800/80">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search bus, plate, or corridor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-800/80 text-[11px] font-bold">
            {(['ALL', 'NOMINAL', 'DELAYED', 'EMERGENCY'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`py-1 rounded-lg transition-colors cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'EMERGENCY' ? 'SOS' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle Roster List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50 p-2 space-y-1">
          {filteredVehicles.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No vehicles matching active filter criteria
            </div>
          ) : (
            filteredVehicles.map((bus) => {
              const isSelected = bus.busId === selectedBusId;
              const isIncidentBus = bus.busId === activeIncident?.busId;
              const capacity = bus.capacity || 55;
              const count = bus.passengerCount || 35;
              const occPct = Math.round((count / capacity) * 100);

              return (
                <div
                  key={bus.busId}
                  onClick={() => flyToBus(bus.busId)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isIncidentBus
                      ? 'bg-rose-950/40 border-rose-500/80 text-rose-200 shadow-lg'
                      : isSelected
                      ? 'bg-indigo-950/40 border-indigo-500/80 text-white'
                      : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-800/50 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Bus className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-black tracking-tight text-white">
                        {bus.plateNumber || `BUS-${bus.busId.slice(0, 4).toUpperCase()}`}
                      </span>
                    </div>

                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide ${
                        isIncidentBus || bus.status === 'SOS'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : bus.status === 'DELAYED'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {isIncidentBus ? 'SOS BREAKDOWN' : bus.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 truncate mb-2">
                    {bus.routeName || 'Campus Corridor Express'}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Gauge className="w-3 h-3 text-slate-500" />
                      {bus.speed || 32} km/h
                    </span>
                    <span className="flex items-center gap-1 font-mono tabular-nums">
                      <Users className="w-3 h-3 text-slate-500" />
                      {count}/{capacity} ({occPct}%)
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer Drill Simulation Action */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40">
          <button
            onClick={handleTriggerTestIncident}
            className="w-full py-2.5 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <Flame className="w-4 h-4 text-rose-400" />
            <span>Simulate Breakdown SOS</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Map Viewport & Top Emergency HUD Overlay */}
      <main className="relative flex-1 h-full overflow-hidden">
        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-10 p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white shadow-xl backdrop-blur-md cursor-pointer transition-colors"
          title={sidebarOpen ? 'Collapse Roster Sidebar' : 'Expand Roster Sidebar'}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Emergency SOS Banner (If Active Incident) */}
        {activeIncident && (
          <div className="absolute top-4 left-16 right-4 z-10 max-w-2xl mx-auto rounded-2xl bg-rose-950/90 border border-rose-600/80 p-3.5 shadow-2xl backdrop-blur-xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-600 text-white animate-pulse">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black tracking-tight text-white">
                    EMERGENCY SOS: {activeIncident.plateNumber}
                  </h2>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-900/80 border border-rose-500/50 text-rose-200">
                    {activeIncident.status}
                  </span>
                </div>
                <p className="text-xs text-rose-200/80 mt-0.5">
                  {activeIncident.reason.replace('_', ' ')} • ~{activeIncident.passengerCount} Stranded • Time Elapsed:{' '}
                  <span className="font-mono font-bold tabular-nums text-white">
                    {formatTimer(elapsedSeconds)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={flyToIncident}
                className="px-3 py-1.5 rounded-lg bg-rose-800/80 hover:bg-rose-700 border border-rose-600 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Locate
              </button>
              <button
                onClick={handleResolveIncident}
                className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
              >
                Resolve
              </button>
            </div>
          </div>
        )}

        {/* Map Container */}
        <div ref={mapContainerRef} className="w-full h-full bg-[#0b0f17]" />

        {/* Map Control Buttons (Floating Right Stack) */}
        <div className="absolute right-4 bottom-6 z-10 flex flex-col gap-2">
          <div className="glass-panel p-1 rounded-2xl border border-slate-800/80 bg-slate-900/90 backdrop-blur-xl shadow-2xl flex flex-col gap-1 text-slate-300">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="p-2.5 rounded-xl hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              title="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="p-2.5 rounded-xl hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                mapRef.current?.flyTo({
                  center: [83.4215, 17.9045],
                  zoom: 12.8,
                  pitch: 25,
                  essential: true,
                });
              }}
              className="p-2.5 rounded-xl hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              title="Reset Campus View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. Incident Intervention Drawer: Candidate Relief Vehicles (Sprint 12 Core Requirement) */}
        {activeIncident && activeIncident.status !== 'RESOLVED' && (
          <div className="absolute left-4 right-4 bottom-6 max-w-xl mx-auto z-10 rounded-3xl bg-slate-900/95 border border-slate-700/80 p-4 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-black tracking-tight text-white uppercase">
                  Nearby Candidate Relief Fleet (Within 5 km Radius)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {candidateReliefBuses.length} Candidates Discovered
              </span>
            </div>

            {/* Candidate Relief Buses List */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {candidateReliefBuses.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No active candidate buses currently detected inside 5km perimeter.
                </div>
              ) : (
                candidateReliefBuses.map((candidate) => {
                  const isDispatched = activeIncident.dispatchedReliefBusId === candidate.busId;

                  return (
                    <div
                      key={candidate.busId}
                      className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                        isDispatched
                          ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                          : 'bg-slate-800/50 border-slate-700/60 text-slate-200'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">{candidate.plateNumber}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                            {candidate.distanceKm} km away
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400 font-bold">
                            ETA: ~{candidate.etaMinutes} mins
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {candidate.routeName} • {candidate.vacantSeats} vacant seats available
                        </p>
                      </div>

                      {isDispatched ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Dispatched</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAuthorizeDiversion(candidate.busId)}
                          disabled={isDispatching}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>1-Click Diversion</span>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Incident Details Summary Note */}
            {activeIncident.notes && (
              <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800/80 italic">
                Note: "{activeIncident.notes}"
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
