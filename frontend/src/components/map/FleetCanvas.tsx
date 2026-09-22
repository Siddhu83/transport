import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Compass, AlertCircle, Locate } from 'lucide-react';

export interface VehicleFeatureProperties {
  busId: string;
  plateNumber: string;
  routeId: string;
  routeName?: string;
  speed: number;
  heading: number;
  status: 'ACTIVE' | 'DELAYED' | 'SOS' | 'OFF_DUTY';
  passengerCount?: number;
  capacity?: number;
  lastPing: string;
}

export interface FleetCanvasProps {
  geoJsonData?: GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>;
  onVehicleSelect?: (vehicle: VehicleFeatureProperties | null) => void;
  selectedBusId?: string | null;
  center?: [number, number];
  zoom?: number;
}

// ANITS Campus Tagarapuvalasa / Visakhapatnam Default Center
const DEFAULT_CENTER: [number, number] = [83.4215, 17.9045];
const DEFAULT_ZOOM = 13;

const DARK_MATTER_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const FleetCanvas: React.FC<FleetCanvasProps> = ({
  geoJsonData,
  onVehicleSelect,
  selectedBusId,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationStatusText, setLocationStatusText] = useState<string>('Campus Default');

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: DARK_MATTER_STYLE,
        center: center,
        zoom: zoom,
        pitch: 30,
        bearing: 0,
        attributionControl: false,
      });

      // Add compact navigation controls
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '© OpenStreetMap contributors © CARTO',
        }),
        'bottom-left'
      );

      map.on('load', () => {
        // Register WebGL GeoJSON source for zero-DOM vehicle marker rendering
        map.addSource('buses-source', {
          type: 'geojson',
          data: geoJsonData || { type: 'FeatureCollection', features: [] },
        });

        // Register WebGL GeoJSON source for Student User Location
        map.addSource('user-location-source', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [],
          },
        });

        // User Location Pulse Glow Ring
        map.addLayer({
          id: 'user-location-glow-layer',
          type: 'circle',
          source: 'user-location-source',
          paint: {
            'circle-radius': 18,
            'circle-color': '#00f0ff',
            'circle-opacity': 0.35,
            'circle-blur': 0.6,
          },
        });

        // User Location Core Dot
        map.addLayer({
          id: 'user-location-dot-layer',
          type: 'circle',
          source: 'user-location-source',
          paint: {
            'circle-radius': 7,
            'circle-color': '#00f0ff',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        });

        // User Location Label
        map.addLayer({
          id: 'user-location-label-layer',
          type: 'symbol',
          source: 'user-location-source',
          layout: {
            'text-field': 'You (Student)',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
          },
          paint: {
            'text-color': '#00f0ff',
            'text-halo-color': '#0b0f17',
            'text-halo-width': 2,
          },
        });

        // 1. Outer Glow Layer for SOS/Active vehicles
        map.addLayer({
          id: 'buses-glow-layer',
          type: 'circle',
          source: 'buses-source',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'busId'], selectedBusId || ''],
              18,
              12,
            ],
            'circle-color': [
              'match',
              ['get', 'status'],
              'SOS',
              '#ef4444',
              'DELAYED',
              '#f59e0b',
              'ACTIVE',
              '#10b981',
              '#64748b',
            ],
            'circle-opacity': 0.25,
            'circle-blur': 0.8,
          },
        });

        // 2. Base Circle Layer (Core Vehicle Marker)
        map.addLayer({
          id: 'buses-circle-layer',
          type: 'circle',
          source: 'buses-source',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'busId'], selectedBusId || ''],
              10,
              7,
            ],
            'circle-color': [
              'match',
              ['get', 'status'],
              'SOS',
              '#ef4444',
              'DELAYED',
              '#f59e0b',
              'ACTIVE',
              '#10b981',
              '#64748b',
            ],
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'busId'], selectedBusId || ''],
              3,
              1.5,
            ],
            'circle-stroke-color': '#0b0f17',
          },
        });

        // 3. Vehicle Direction Arrow / Symbol Layer
        map.addLayer({
          id: 'buses-label-layer',
          type: 'symbol',
          source: 'buses-source',
          layout: {
            'text-field': ['get', 'plateNumber'],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: {
            'text-color': '#f8fafc',
            'text-halo-color': '#0b0f17',
            'text-halo-width': 2,
          },
        });

        // Click Handler for WebGL Symbols
        map.on('click', 'buses-circle-layer', (e) => {
          if (e.features && e.features.length > 0) {
            const props = e.features[0].properties as VehicleFeatureProperties;
            if (onVehicleSelect) {
              onVehicleSelect(props);
            }
          }
        });

        // Cursor state on hover over WebGL markers
        map.on('mouseenter', 'buses-circle-layer', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'buses-circle-layer', () => {
          map.getCanvas().style.cursor = '';
        });

        mapRef.current = map;
        setIsLoaded(true);

        // Auto-request HTML5 Geolocation on initial map load
        detectUserLocation(map, false);
      });

      map.on('error', (e) => {
        console.warn('MapLibre WebGL Layer Error:', e);
      });
    } catch (err) {
      setMapError(err instanceof Error ? err.message : 'Failed to initialize MapLibre WebGL canvas');
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // HTML5 Client-Side Geolocation Handler (Zero Backend Degradation)
  const detectUserLocation = (mapInstance?: maplibregl.Map | null, flyTo = true) => {
    const targetMap = mapInstance || mapRef.current;
    if (!navigator.geolocation) {
      setLocationStatusText('GPS Unsupported');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        const coords: [number, number] = [longitude, latitude];
        setUserLocation(coords);
        setLocationStatusText('Live Location Active');
        setIsLocating(false);

        // Update User Location GeoJSON Source on Map
        if (targetMap) {
          const userSource = targetMap.getSource('user-location-source') as maplibregl.GeoJSONSource;
          if (userSource) {
            userSource.setData({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'Point',
                    coordinates: coords,
                  },
                  properties: {},
                },
              ],
            });
          }

          if (flyTo) {
            targetMap.flyTo({
              center: coords,
              zoom: 14.5,
              pitch: 25,
              speed: 1.2,
            });
          }
        }
      },
      (error) => {
        console.info('HTML5 Geolocation info/fallback:', error.message);
        setLocationStatusText('Campus Center');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  // Sync GeoJSON updates without re-instantiating WebGL map instance
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const source = mapRef.current.getSource('buses-source') as maplibregl.GeoJSONSource;
    if (source && geoJsonData) {
      source.setData(geoJsonData);
      setActiveCount(geoJsonData.features.length);
    }
  }, [geoJsonData, isLoaded]);

  // Update selection highlight dynamically
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const busId = selectedBusId || '';
    if (mapRef.current.getLayer('buses-circle-layer')) {
      mapRef.current.setPaintProperty('buses-circle-layer', 'circle-radius', [
        'case',
        ['==', ['get', 'busId'], busId],
        10,
        7,
      ]);
      mapRef.current.setPaintProperty('buses-circle-layer', 'circle-stroke-width', [
        'case',
        ['==', ['get', 'busId'], busId],
        3,
        1.5,
      ]);
    }
  }, [selectedBusId, isLoaded]);

  const handleResetView = () => {
    if (mapRef.current) {
      const targetCenter = userLocation || DEFAULT_CENTER;
      mapRef.current.flyTo({ center: targetCenter, zoom: DEFAULT_ZOOM, pitch: 30, bearing: 0 });
    }
  };

  const handleLocateClick = () => {
    detectUserLocation(mapRef.current, true);
  };

  return (
    <div className="relative w-full h-full min-h-[500px] bg-[#0b0f17] overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />

      {/* Loading Overlay */}
      {!isLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b0f17]/90 z-20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <p className="text-xs tracking-widest uppercase font-mono text-cyan-400">Initializing WebGL Engine...</p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {mapError && (
        <div className="absolute top-4 left-4 right-4 z-30 glass-panel p-4 rounded-lg border-red-500/30 flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-xs font-mono">{mapError}</p>
        </div>
      )}

      {/* Map Top Status HUD Overlay */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3 pointer-events-auto">
        <div className="glass-panel-glow px-4 py-2 rounded-lg flex items-center gap-3">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase flex items-center gap-1.5">
              <span>WebGL Fleet Canvas</span>
              <span className="text-cyan-400 text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/30">
                {locationStatusText}
              </span>
            </div>
            <div className="text-xs font-mono font-bold text-slate-100 flex items-center gap-1.5">
              <span>{activeCount}</span>
              <span className="text-[10px] text-slate-400 font-normal">Vehicles Rendered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Quick Action Floating Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={handleLocateClick}
          title="Center on My Location (Student GPS)"
          className={`glass-panel p-2.5 rounded-lg transition-all cursor-pointer shadow-lg ${
            isLocating
              ? 'text-cyan-400 animate-spin border-cyan-500/50'
              : userLocation
              ? 'text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10'
              : 'text-slate-300 hover:text-cyan-400 hover:border-cyan-500/30'
          }`}
        >
          <Locate className="w-4 h-4" />
        </button>

        <button
          onClick={handleResetView}
          title="Reset Map Camera View"
          className="glass-panel p-2.5 rounded-lg text-slate-300 hover:text-cyan-400 hover:border-cyan-500/30 transition-all cursor-pointer shadow-lg"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default FleetCanvas;
