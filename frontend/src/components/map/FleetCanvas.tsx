import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { AlertCircle, Locate } from 'lucide-react';
import { FleetDropdown } from './FleetDropdown';

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
  lastSeen?: number | string;
}

export interface FleetCanvasProps {
  geoJsonData?: GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>;
  onVehicleSelect?: (vehicle: VehicleFeatureProperties | null) => void;
  selectedBusId?: string | null;
  center?: [number, number];
  zoom?: number;
  latencyMs?: number | null;
  streamStatus?: string;
  theme?: 'dark' | 'light';
  hideDropdown?: boolean;
  recenterTrigger?: number;
}

// ANITS Campus Tagarapuvalasa / Visakhapatnam Default Center
const DEFAULT_CENTER: [number, number] = [83.4215, 17.9045];
const DEFAULT_ZOOM = 13;

const DARK_MATTER_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export const FleetCanvas: React.FC<FleetCanvasProps> = ({
  geoJsonData,
  onVehicleSelect,
  selectedBusId,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  theme = 'dark',
  hideDropdown = false,
  recenterTrigger,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Helper to attach WebGL sources & layers onto map style load
  const attachMapLayers = (map: maplibregl.Map, currentTheme: 'dark' | 'light') => {
    // 1. Buses GeoJSON Source
    if (!map.getSource('buses-source')) {
      map.addSource('buses-source', {
        type: 'geojson',
        data: geoJsonData || { type: 'FeatureCollection', features: [] },
      });
    }

    // 2. User Location GeoJSON Source
    if (!map.getSource('user-location-source')) {
      map.addSource('user-location-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: userLocation
            ? [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: userLocation },
                  properties: {},
                },
              ]
            : [],
        },
      });
    }

    // 3. User Location Glow Layer
    if (!map.getLayer('user-location-glow-layer')) {
      map.addLayer({
        id: 'user-location-glow-layer',
        type: 'circle',
        source: 'user-location-source',
        paint: {
          'circle-radius': 18,
          'circle-color': '#facc15',
          'circle-opacity': 0.3,
          'circle-blur': 0.6,
        },
      });
    }

    // 4. User Location Core Dot
    if (!map.getLayer('user-location-dot-layer')) {
      map.addLayer({
        id: 'user-location-dot-layer',
        type: 'circle',
        source: 'user-location-source',
        paint: {
          'circle-radius': 7,
          'circle-color': '#facc15',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    // 5. User Location Label Layer
    if (!map.getLayer('user-location-label-layer')) {
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
          'text-color': '#facc15',
          'text-halo-color': currentTheme === 'dark' ? '#09090b' : '#ffffff',
          'text-halo-width': 2,
        },
      });
    }

    // 6. Buses Glow Layer
    if (!map.getLayer('buses-glow-layer')) {
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
            '#dc2626',
            'DELAYED',
            '#d97706',
            'ACTIVE',
            '#16a34a',
            '#64748b',
          ],
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      });
    }

    // 7. Buses Circle Layer
    if (!map.getLayer('buses-circle-layer')) {
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
            '#dc2626',
            'DELAYED',
            '#d97706',
            'ACTIVE',
            '#16a34a',
            '#64748b',
          ],
          'circle-stroke-width': [
            'case',
            ['==', ['get', 'busId'], selectedBusId || ''],
            3,
            1.5,
          ],
          'circle-stroke-color': currentTheme === 'dark' ? '#09090b' : '#ffffff',
        },
      });
    }

    // 8. Buses Label Layer
    if (!map.getLayer('buses-label-layer')) {
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
          'text-color': currentTheme === 'dark' ? '#f4f4f5' : '#09090b',
          'text-halo-color': currentTheme === 'dark' ? '#09090b' : '#ffffff',
          'text-halo-width': 2,
        },
      });
    }

    // Event Handlers for WebGL Markers
    map.off('click', 'buses-circle-layer', () => {});
    map.on('click', 'buses-circle-layer', (e) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties as VehicleFeatureProperties;
        if (onVehicleSelect) {
          onVehicleSelect(props);
        }
      }
    });

    map.on('mouseenter', 'buses-circle-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'buses-circle-layer', () => {
      map.getCanvas().style.cursor = '';
    });
  };

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const initialStyle = theme === 'dark' ? DARK_MATTER_STYLE : VOYAGER_STYLE;
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: initialStyle,
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
        attachMapLayers(map, theme);
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

  // Handle Dynamic Theme Switching on Map Engine
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    const targetStyle = theme === 'dark' ? DARK_MATTER_STYLE : VOYAGER_STYLE;

    const handleStyleLoad = () => {
      if (mapRef.current) {
        attachMapLayers(mapRef.current, theme);
        const source = mapRef.current.getSource('buses-source') as maplibregl.GeoJSONSource;
        if (source && geoJsonData) {
          source.setData(geoJsonData);
        }
      }
    };

    mapRef.current.once('style.load', handleStyleLoad);
    mapRef.current.setStyle(targetStyle);

  }, [theme]);

  // HTML5 Client-Side Geolocation Handler
  const detectUserLocation = (mapInstance?: maplibregl.Map | null, flyTo = true) => {
    const targetMap = mapInstance || mapRef.current;
    if (!navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        const coords: [number, number] = [longitude, latitude];
        setUserLocation(coords);
        setIsLocating(false);

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
              curve: 1.2,
            });
          }
        }
      },
      (error) => {
        console.info('HTML5 Geolocation info/fallback:', error.message);
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

  // Smooth camera fly-to when selectedBusId or recenterTrigger updates
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    if (selectedBusId) {
      const feature = geoJsonData?.features.find((f) => f.properties.busId === selectedBusId);
      if (feature) {
        const coords = feature.geometry.coordinates as [number, number];
        mapRef.current.flyTo({
          center: coords,
          zoom: 15.5,
          pitch: 35,
          speed: 1.2,
          curve: 1.2,
        });
      }
    } else {
      // Global fleet overview
      mapRef.current.flyTo({
        center: center,
        zoom: zoom,
        pitch: 25,
        speed: 1.0,
        curve: 1.2,
      });
    }
  }, [selectedBusId, recenterTrigger, isLoaded]);

  const handleBusDropdownSelect = (busId: string | null) => {
    if (!busId) {
      if (onVehicleSelect) onVehicleSelect(null);
      return;
    }
    const feature = geoJsonData?.features.find((f) => f.properties.busId === busId);
    if (feature) {
      if (onVehicleSelect) onVehicleSelect(feature.properties);
    }
  };

  const handleLocateClick = () => {
    detectUserLocation(mapRef.current, true);
  };

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden bg-theme-canvas">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />

      {/* Loading Overlay */}
      {!isLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center z-20 backdrop-blur-sm bg-theme-canvas/90 text-brand-primary">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            <p className="text-xs tracking-widest uppercase font-mono font-extrabold text-theme-main">
              Initializing WebGL Engine...
            </p>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {mapError && (
        <div className="absolute top-4 left-4 right-4 z-30 glass-panel p-4 rounded-xl border border-status-sos/40 flex items-center gap-3 text-status-sos">
          <AlertCircle className="w-5 h-5 shrink-0 text-status-sos" />
          <p className="text-xs font-mono font-bold">{mapError}</p>
        </div>
      )}

      {/* Map Top Status HUD & Target Bus Selector (Hidden in Mobile View) */}
      {!hideDropdown && (
        <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-3 pointer-events-auto">
          <FleetDropdown
            geoJsonData={geoJsonData}
            selectedBusId={selectedBusId}
            onSelectBus={handleBusDropdownSelect}
            theme={theme}
          />
        </div>
      )}

      {/* Map Quick Action Floating Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 pointer-events-auto font-mono">
        <button
          onClick={handleLocateClick}
          title="Center on My Location (Student GPS)"
          className={`glass-panel p-3 rounded-xl transition-all cursor-pointer shadow-xl border border-theme-border ${
            isLocating
              ? 'text-brand-primary animate-spin border-brand-primary/50'
              : userLocation
              ? 'text-brand-primary border-brand-primary/40 bg-brand-primary/10'
              : 'text-theme-muted hover:text-brand-primary hover:bg-theme-hover'
          }`}
        >
          <Locate className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default FleetCanvas;
