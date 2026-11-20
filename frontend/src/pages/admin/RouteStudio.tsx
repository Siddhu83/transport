import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  ArrowLeft,
  Search,
  MapPin,
  Upload,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  AlertCircle,
  FileCode,
  Save,
  Route as RouteIcon,
} from 'lucide-react';
import { ENDPOINTS } from '../../config/api';

interface StudioStop {
  id: string;
  name: string;
  code?: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

interface GeocodingResult {
  display_name: string;
  lat: string;
  lon: string;
}

export const RouteStudio: React.FC = () => {
  const navigate = useNavigate();

  // Mode: 'STUDIO' (Pathway A: Interactive Map) or 'IMPORT' (Pathway C: KML/GPX)
  const [mode, setMode] = useState<'STUDIO' | 'IMPORT'>('STUDIO');

  // Route Metadata
  const [routeNumber, setRouteNumber] = useState<string>('R-105');
  const [routeName, setRouteName] = useState<string>('Campus Expressway Express');
  const [assignedBusId, setAssignedBusId] = useState<string>('');
  const [availableBuses] = useState<Array<{ id: string; plate: string }>>([
    { id: 'bus-101', plate: 'AP 39 TE 1001 (Bus #1)' },
    { id: 'bus-102', plate: 'AP 39 TE 1002 (Bus #2)' },
    { id: 'bus-103', plate: 'AP 39 TE 1003 (Bus #3)' },
    { id: 'bus-104', plate: 'AP 39 TE 1004 (Bus #4)' },
  ]);

  // Stops State
  const [stops, setStops] = useState<StudioStop[]>([
    {
      id: 'stop-1',
      name: 'Campus Main Gate',
      latitude: 17.9045,
      longitude: 83.4215,
      geofenceRadiusMeters: 50,
    },
    {
      id: 'stop-2',
      name: 'Tagarapuvalasa Junction',
      latitude: 17.912,
      longitude: 83.428,
      geofenceRadiusMeters: 50,
    },
    {
      id: 'stop-3',
      name: 'Anandapuram Toll Gate',
      latitude: 17.925,
      longitude: 83.442,
      geofenceRadiusMeters: 50,
    },
  ]);

  // Road Polyline Coordinates
  const [polylineCoords, setPolylineCoords] = useState<[number, number][]>([]);
  const [isRouting, setIsRouting] = useState<boolean>(false);

  // Landmark Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // File Upload State
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string; type: 'kml' | 'gpx' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Initialize MapLibre Canvas
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [83.4215, 17.9045], // ANITS Campus Tagarapuvalasa
      zoom: 13,
      pitch: 20,
      attributionControl: false,
    });

    map.on('load', () => {
      // 1. Polyline Route Layer
      map.addSource('route-corridor', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route-corridor',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1e3a8a',
          'line-width': 8,
          'line-opacity': 0.6,
        },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-corridor',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#3b82f6', // Royal Blue
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });

      // 2. Stops Geofence Layer
      map.addSource('stops-geofence', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'stops-glow',
        type: 'circle',
        source: 'stops-geofence',
        paint: {
          'circle-radius': 16,
          'circle-color': '#3b82f6',
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      });

      map.addLayer({
        id: 'stops-circle',
        type: 'circle',
        source: 'stops-geofence',
        paint: {
          'circle-radius': 8,
          'circle-color': '#3b82f6',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'stops-label',
        type: 'symbol',
        source: 'stops-geofence',
        layout: {
          'text-field': ['get', 'order'],
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      mapRef.current = map;
      setMapLoaded(true);
    });

    // Interactive Map Click Handler to add Stops in Studio Mode
    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      const newStop: StudioStop = {
        id: `stop-${Date.now().toString(36)}`,
        name: `Stop ${stops.length + 1}`,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        geofenceRadiusMeters: 50,
      };

      setStops((prev) => [...prev, newStop]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Sync Road Polyline & Stop Layers to Map Canvas
  const updateMapLayers = useCallback(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Update Stops
    const stopsSource = mapRef.current.getSource('stops-geofence') as maplibregl.GeoJSONSource;
    if (stopsSource) {
      stopsSource.setData({
        type: 'FeatureCollection',
        features: stops.map((s, idx) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [s.longitude, s.latitude],
          },
          properties: {
            id: s.id,
            name: s.name,
            order: (idx + 1).toString(),
          },
        })),
      });
    }

    // Update Polyline
    const routeSource = mapRef.current.getSource('route-corridor') as maplibregl.GeoJSONSource;
    if (routeSource) {
      if (polylineCoords.length >= 2) {
        routeSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: polylineCoords,
              },
              properties: {},
            },
          ],
        });
      } else {
        routeSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [stops, polylineCoords, mapLoaded]);

  useEffect(() => {
    updateMapLayers();
  }, [updateMapLayers]);

  // Request OSRM Road Polyline when Stops Change in Studio Mode
  useEffect(() => {
    if (mode !== 'STUDIO' || stops.length < 2) {
      if (mode === 'STUDIO') setPolylineCoords([]);
      return;
    }

    let isMounted = true;
    const fetchOsrmRoute = async () => {
      setIsRouting(true);
      try {
        const coordsStr = stops.map((s) => `${s.longitude},${s.latitude}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data?.routes?.[0]?.geometry?.coordinates) {
            setPolylineCoords(data.routes[0].geometry.coordinates);
          }
        }
      } catch (err) {
        // Fallback: direct line connecting stops
        if (isMounted) {
          setPolylineCoords(stops.map((s) => [s.longitude, s.latitude]));
        }
      } finally {
        if (isMounted) setIsRouting(false);
      }
    };

    fetchOsrmRoute();
    return () => {
      isMounted = false;
    };
  }, [stops, mode]);

  // Landmark Search via Nominatim
  const handleSearchLandmark = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchQuery
      )}&limit=5`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (res: GeocodingResult) => {
    const lat = parseFloat(res.lat);
    const lng = parseFloat(res.lon);
    if (isNaN(lat) || isNaN(lng)) return;

    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 15,
        essential: true,
      });
    }

    const simpleName = res.display_name.split(',')[0] || `Stop ${stops.length + 1}`;
    setStops((prev) => [
      ...prev,
      {
        id: `stop-${Date.now().toString(36)}`,
        name: simpleName,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        geofenceRadiusMeters: 50,
      },
    ]);

    setSearchResults([]);
    setSearchQuery('');
  };

  // Stop Reordering Handlers
  const moveStop = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === stops.length - 1) return;

    setStops((prev) => {
      const updated = [...prev];
      const targetIdx = direction === 'UP' ? index - 1 : index + 1;
      const temp = updated[index]!;
      updated[index] = updated[targetIdx]!;
      updated[targetIdx] = temp;
      return updated;
    });
  };

  const removeStop = (id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
  };

  const updateStopName = (id: string, name: string) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  };

  // Client-Side KML / GPX Parser for Instant Visual Preview
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const type: 'kml' | 'gpx' = fileName.endsWith('.gpx') ? 'gpx' : 'kml';

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      setUploadedFile({ name: file.name, content, type });
      setMode('IMPORT');

      try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(content, 'text/xml');
        const extractedStops: StudioStop[] = [];
        const extractedPoly: [number, number][] = [];

        if (type === 'kml') {
          const docName = xml.querySelector('Document > name')?.textContent;
          if (docName) setRouteName(docName.trim());

          const placemarks = Array.from(xml.querySelectorAll('Placemark'));
          for (const pm of placemarks) {
            const name = pm.querySelector('name')?.textContent || `Stop ${extractedStops.length + 1}`;
            const pointCoord = pm.querySelector('Point > coordinates')?.textContent;
            if (pointCoord) {
              const [lngStr, latStr] = pointCoord.trim().split(',');
              const lng = parseFloat(lngStr || '');
              const lat = parseFloat(latStr || '');
              if (!isNaN(lat) && !isNaN(lng)) {
                extractedStops.push({
                  id: `stop-${extractedStops.length + 1}`,
                  name: name.trim(),
                  latitude: Number(lat.toFixed(6)),
                  longitude: Number(lng.toFixed(6)),
                  geofenceRadiusMeters: 50,
                });
              }
            }

            const lineCoord = pm.querySelector('LineString > coordinates')?.textContent;
            if (lineCoord) {
              const tokens = lineCoord.trim().split(/\s+/);
              for (const tok of tokens) {
                const [lngStr, latStr] = tok.split(',');
                const lng = parseFloat(lngStr || '');
                const lat = parseFloat(latStr || '');
                if (!isNaN(lat) && !isNaN(lng)) {
                  extractedPoly.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
                }
              }
            }
          }
        } else {
          // GPX Parser
          const gpxName = xml.querySelector('metadata > name, trk > name')?.textContent;
          if (gpxName) setRouteName(gpxName.trim());

          const waypoints = Array.from(xml.querySelectorAll('wpt'));
          for (const wpt of waypoints) {
            const lat = parseFloat(wpt.getAttribute('lat') || '');
            const lon = parseFloat(wpt.getAttribute('lon') || '');
            const name = wpt.querySelector('name')?.textContent || `Stop ${extractedStops.length + 1}`;
            if (!isNaN(lat) && !isNaN(lon)) {
              extractedStops.push({
                id: `stop-${extractedStops.length + 1}`,
                name: name.trim(),
                latitude: Number(lat.toFixed(6)),
                longitude: Number(lon.toFixed(6)),
                geofenceRadiusMeters: 50,
              });
            }
          }

          const trackPoints = Array.from(xml.querySelectorAll('trkpt'));
          for (const pt of trackPoints) {
            const lat = parseFloat(pt.getAttribute('lat') || '');
            const lon = parseFloat(pt.getAttribute('lon') || '');
            if (!isNaN(lat) && !isNaN(lon)) {
              extractedPoly.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
            }
          }
        }

        if (extractedStops.length > 0) {
          setStops(extractedStops);
        }

        if (extractedPoly.length >= 2) {
          setPolylineCoords(extractedPoly);
        } else if (extractedStops.length >= 2) {
          setPolylineCoords(extractedStops.map((s) => [s.longitude, s.latitude]));
        }

        // Fly map to bounding box of imported stops
        if (extractedStops.length > 0 && mapRef.current) {
          const first = extractedStops[0]!;
          mapRef.current.flyTo({
            center: [first.longitude, first.latitude],
            zoom: 13,
            essential: true,
          });
        }
      } catch (err) {
        console.warn('Local preview parse error:', err);
      }
    };
    reader.readAsText(file);
  };

  // Corridor Metrics Calculation
  const metrics = useMemo(() => {
    let totalKm = 0;
    for (let i = 0; i < polylineCoords.length - 1; i++) {
      const [lng1, lat1] = polylineCoords[i]!;
      const [lng2, lat2] = polylineCoords[i + 1]!;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalKm += 6371 * c;
    }

    const estimatedDuration = Math.round((totalKm / 30) * 60) + Math.max(0, stops.length - 1) * 2;
    return {
      totalDistanceKm: Number(totalKm.toFixed(1)),
      estimatedMinutes: Math.max(5, estimatedDuration),
      stopCount: stops.length,
    };
  }, [polylineCoords, stops]);

  // Save & Publish Route to Backend
  const handleSaveRoute = async () => {
    if (stops.length < 2) {
      setStatusNotice({ type: 'error', message: 'Route must have at least 2 stops before publishing.' });
      return;
    }

    setIsSubmitting(true);
    setStatusNotice(null);

    try {
      let res: Response;
      const token = localStorage.getItem('ats_token') || '';

      if (mode === 'IMPORT' && uploadedFile) {
        // Call Import File Endpoint
        res = await fetch(ENDPOINTS.ROUTES_IMPORT_FILE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            fileContent: uploadedFile.content,
            fileType: uploadedFile.type,
            routeNumber: routeNumber.trim(),
            name: routeName.trim(),
            busId: assignedBusId || undefined,
          }),
        });
      } else {
        // Call Interactive Studio Endpoint
        res = await fetch(ENDPOINTS.ROUTES_STUDIO, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            routeNumber: routeNumber.trim(),
            name: routeName.trim(),
            busId: assignedBusId || undefined,
            stops: stops.map((s) => ({
              name: s.name,
              latitude: s.latitude,
              longitude: s.longitude,
              geofenceRadiusMeters: s.geofenceRadiusMeters,
            })),
            polylineCoordinates: polylineCoords.length >= 2 ? polylineCoords : undefined,
          }),
        });
      }

      if (res.ok) {
        await res.json();
        setStatusNotice({
          type: 'success',
          message: `Corridor '${routeNumber}' successfully published! Active vehicles and student apps synchronized.`,
        });
      } else {
        const errData = await res.json().catch(() => null);
        setStatusNotice({
          type: 'error',
          message: errData?.message || `Failed to save route (HTTP ${res.status})`,
        });
      }
    } catch (err: unknown) {
      setStatusNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Network error saving route',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#0b0f17] text-slate-100 font-sans flex">
      {/* 1. Left Studio Sidebar (420px Desktop Width) */}
      <aside className="relative z-20 h-full w-[420px] shrink-0 border-r border-slate-800/80 bg-[#0b0f17]/95 backdrop-blur-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/admin')}
              className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Control Tower</span>
            </button>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              ROUTE STUDIO
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <RouteIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white">Corridor Ingestion Studio</h1>
              <p className="text-[11px] text-slate-400">Draw stops or import Google My Maps KML</p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900/80 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => setMode('STUDIO')}
              className={`py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'STUDIO' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Interactive Studio</span>
            </button>
            <button
              onClick={() => setMode('IMPORT')}
              className={`py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'IMPORT' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import KML / GPX</span>
            </button>
          </div>
        </div>

        {/* Route Metadata Inputs */}
        <div className="p-4 border-b border-slate-800/80 space-y-3 bg-slate-900/40 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Route Number</label>
              <input
                type="text"
                value={routeNumber}
                onChange={(e) => setRouteNumber(e.target.value)}
                placeholder="R-101"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Link to Bus</label>
              <select
                value={assignedBusId}
                onChange={(e) => setAssignedBusId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">Standalone Template</option>
                {availableBuses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.plate}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Corridor Name</label>
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Sector 1 Express Corridor"
              className="w-full px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Mode Specific Controls */}
        {mode === 'STUDIO' ? (
          <div className="p-4 border-b border-slate-800/80 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search landmark (e.g. NAD Junction)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchLandmark()}
                className="w-full pl-9 pr-16 py-2 text-xs rounded-xl bg-slate-800/60 border border-slate-700/60 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSearchLandmark}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-bold text-white transition-colors cursor-pointer"
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="p-1 rounded-xl bg-slate-900 border border-slate-700 space-y-1 max-h-40 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectSearchResult(r)}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-800 text-[11px] text-slate-200 truncate cursor-pointer block"
                  >
                    📍 {r.display_name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>💡 Click anywhere on map to drop a stop</span>
              {isRouting && <span className="text-blue-400 font-mono text-[10px] animate-pulse">Auto-routing...</span>}
            </div>
          </div>
        ) : (
          <div className="p-4 border-b border-slate-800/80 space-y-3">
            <label className="block p-4 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-2xl bg-slate-900/60 text-center cursor-pointer transition-colors group">
              <FileCode className="w-8 h-8 text-slate-500 group-hover:text-blue-400 mx-auto mb-2 transition-colors" />
              <p className="text-xs font-bold text-white mb-0.5">Click or drag Google My Maps .kml or .gpx here</p>
              <p className="text-[10px] text-slate-400">Extracts both stop waypoints and road polyline curves</p>
              <input type="file" accept=".kml,.gpx" onChange={handleFileUpload} className="hidden" />
            </label>

            {uploadedFile && (
              <div className="p-2.5 rounded-xl bg-blue-950/20 border border-blue-800/30 flex items-center justify-between text-xs">
                <span className="font-mono text-blue-300 truncate max-w-[250px]">📄 {uploadedFile.name}</span>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                  {uploadedFile.type}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Stops Sequence Roster */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-slate-300">Stops Sequence ({stops.length})</span>
            {stops.length > 0 && (
              <button
                onClick={() => setStops([])}
                className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {stops.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
              No stops added yet. Click on the map or search landmarks to drop your first stop.
            </div>
          ) : (
            stops.map((stop, idx) => (
              <div
                key={stop.id}
                className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors flex items-center gap-2 group"
              >
                <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={stop.name}
                    onChange={(e) => updateStopName(stop.id, e.target.value)}
                    className="w-full bg-transparent text-xs font-semibold text-white focus:outline-none focus:border-b focus:border-blue-500 truncate"
                  />
                  <div className="text-[10px] text-slate-500 font-mono">
                    {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                  </div>
                </div>

                {/* Move Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => moveStop(idx, 'UP')}
                    disabled={idx === 0}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveStop(idx, 'DOWN')}
                    disabled={idx === stops.length - 1}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeStop(stop.id)}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions & Corridor Metrics */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 space-y-3">
          {/* Metrics Pill Grid */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Distance</div>
              <div className="text-sm font-black text-white tabular-nums">{metrics.totalDistanceKm} km</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Duration</div>
              <div className="text-sm font-black text-blue-400 tabular-nums">~{metrics.estimatedMinutes}m</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <div className="text-[9px] font-bold text-slate-400 uppercase">Stops</div>
              <div className="text-sm font-black text-white tabular-nums">{metrics.stopCount}</div>
            </div>
          </div>

          {/* Status Alert Banner */}
          {statusNotice && (
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                statusNotice.type === 'success'
                  ? 'bg-blue-950/40 border-blue-500/50 text-blue-300'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              }`}
            >
              {statusNotice.type === 'success' ? (
                <Check className="w-4 h-4 text-blue-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="text-[11px] leading-snug">{statusNotice.message}</span>
            </div>
          )}

          <button
            onClick={handleSaveRoute}
            disabled={isSubmitting || stops.length < 2}
            className="w-full py-3 px-4 rounded-xl font-bold text-xs tracking-wider uppercase bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950/50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-98"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving Route...' : 'Save & Publish Corridor'}</span>
          </button>
        </div>
      </aside>

      {/* 2. Map Canvas Studio Preview */}
      <main className="relative flex-1 h-full bg-[#090d14]">
        <div ref={mapContainerRef} className="w-full h-full" />
      </main>
    </div>
  );
};
