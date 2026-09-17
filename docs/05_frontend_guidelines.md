# 05. Frontend Engineering & UI/UX Standards

## 1. Architectural Philosophy & Performance Guardrails

The frontend architecture prioritizes sub-second initial load, stable 60 FPS map animations, and zero UI thread freezes across low-end mobile devices and high-resolution desktop control towers.

### Core Invariants:
1. **Zero DOM Marker Thrashing:** Never instantiate HTML DOM markers (`new maplibregl.Marker()`) for live fleet tracking. All buses, stops, and dynamic radius circles must render via **hardware-accelerated WebGL layers** (`symbol`, `circle`, `line`) fed by single GeoJSON sources.
2. **Decoupled Render & Ingestion Loops:** Network packets received from the Server-Sent Events (SSE) stream must write to a synchronized ref/state buffer. Screen rendering coordinates must be sampled and computed via `requestAnimationFrame` using Linear Interpolation (LERP).
3. **PWA-First Offline Resilience:** Essential route lists, stops, user session claims, and static map assets must be cached via service workers so the UI loads instantly even in cellular dead zones.

---

## 2. Design System & Design Tokens (Tailwind CSS v4 + shadcn/ui)

The interface follows an **Airport Flight Information Display (FIDS)** design aesthetic: high-contrast, data-dense, minimalist, with strict status-based chromatic semantics.

### 2.1 Color Palette & Semantic Tokens

```css
@theme {
  /* Surface & Canvas Tokens */
  --color-canvas-bg: #0b0f17;         /* Deep obsidian background */
  --color-canvas-surface: #141b26;    /* Card and panel container */
  --color-canvas-elevated: #1e2838;   /* Popover and dropdown elevation */
  --color-canvas-border: #283548;     /* High-precision thin border lines */

  /* Typography Tokens */
  --color-text-primary: #f8fafc;      /* High-emphasis headers and values */
  --color-text-secondary: #94a3b8;    /* Route descriptions and metrics */
  --color-text-muted: #64748b;        /* Disconnected states, timestamps */

  /* Operational Status Accents */
  --color-status-active: #10b981;     /* Emerald 500: On route, optimal */
  --color-status-delayed: #f59e0b;    /* Amber 500: Heavy traffic, delay >10m */
  --color-status-offline: #64748b;    /* Slate 500: Parked, no recent ping */
  --color-status-sos: #ef4444;        /* Crimson 500: Breakdown / Emergency */
  --color-status-relief: #38bdf8;     /* Sky 400: Dispatched backup bus */

  /* Brand Accent */
  --color-brand-primary: #3b82f6;     /* Transit Blue */
  --color-brand-ring: #60a5fa;
}
```

### 2.2 Typography Scale & Data Legibility
- **Font Stack (UI & Labels):** `Inter`, `system-ui`, `-apple-system`, `sans-serif`.
- **Font Stack (Telemetry Metrics & Timers):** `JetBrains Mono`, `ui-monospace`, `monospace`.
- **Tabular Figures:** Numbers must render using tabular figures (`font-variant-numeric: tabular-nums`) to prevent layout shift during countdowns and speed changes.

---

## 3. High-Performance Map Implementation (MapLibre GL JS)

### 3.1 Map Initialization & Tile Optimization
Use vector tiles rendered locally or through open vector sources (e.g., CartoDB Dark Matter or Protomaps) with all non-essential layer labels removed to prioritize fleet visibility.

```tsx
// src/components/map/FleetCanvas.tsx
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export const FleetCanvas: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [78.3489, 17.4435], // Campus Base [lng, lat]
      zoom: 14,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    map.on('load', () => {
      // 1. Initialize empty GeoJSON source for all active vehicles
      map.addSource('buses-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // 2. Add Symbol Layer for 60FPS marker rendering with rotation
      map.addLayer({
        id: 'buses-layer',
        type: 'symbol',
        source: 'buses-source',
        layout: {
          'icon-image': 'bus-marker-icon', // Loaded pre-rendered SVG bitmap
          'icon-size': 0.85,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'text-field': ['get', 'routeNumber'],
          'text-font': ['Open Sans Bold'],
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
    });

    mapRef.current = map;
    return () => map.remove();
  }, []);

  return <div ref={mapContainer} className="relative h-screen w-screen bg-[#0b0f17]" />;
};
```

---

## 4. Mathematical Client-Side Smoothing: LERP Engine

To prevent sudden jumping or stuttering between telemetry intervals (pushed every 3 seconds), an animation loop runs continuously, interpolating the coordinate matrix along the time delta vector.

```typescript
// src/hooks/useLerpMovement.ts
import { useRef, useEffect } from 'react';

interface BusCoordinateState {
  currentLng: number;
  currentLat: number;
  targetLng: number;
  targetLat: number;
  currentHeading: number;
  targetHeading: number;
  lastUpdated: number;
}

export function useFleetInterpolation(
  onTick: (interpolatedFeatures: GeoJSON.Feature[]) => void
) {
  const telemetryBuffer = useRef<Map<string, BusCoordinateState>>(new Map());
  const animationFrameId = useRef<number | null>(null);

  // Ingest incoming SSE coordinates into buffer
  const updateBusTarget = (
    busId: string,
    lng: number,
    lat: number,
    heading: number,
    meta: Record<string, any>
  ) => {
    const existing = telemetryBuffer.current.get(busId);
    const now = performance.now();

    if (!existing) {
      telemetryBuffer.current.set(busId, {
        currentLng: lng,
        currentLat: lat,
        targetLng: lng,
        targetLat: lat,
        currentHeading: heading,
        targetHeading: heading,
        lastUpdated: now,
        ...meta,
      });
    } else {
      telemetryBuffer.current.set(busId, {
        ...existing,
        currentLng: existing.currentLng,
        currentLat: existing.currentLat,
        targetLng: lng,
        targetLat: lat,
        currentHeading: existing.currentHeading,
        targetHeading: heading,
        lastUpdated: now,
        ...meta,
      });
    }
  };

  useEffect(() => {
    const animate = () => {
      const features: GeoJSON.Feature[] = [];

      telemetryBuffer.current.forEach((bus, busId) => {
        // LERP factor (smoothing curve over typical 3000ms frame delta)
        const alpha = 0.05;

        // Compute Linear Interpolation
        bus.currentLng += (bus.targetLng - bus.currentLng) * alpha;
        bus.currentLat += (bus.targetLat - bus.currentLat) * alpha;
        
        // Handle Heading wrap-around (0-360)
        let deltaHeading = (bus.targetHeading - bus.currentHeading + 540) % 360 - 180;
        bus.currentHeading += deltaHeading * alpha;

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [bus.currentLng, bus.currentLat],
          },
          properties: {
            busId,
            heading: bus.currentHeading,
            ...bus,
          },
        });
      });

      if (features.length > 0) {
        onTick(features);
      }

      animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [onTick]);

  return { updateBusTarget };
}
```

---

## 5. View-Specific UX Flows & Screen Layouts

### 5.1 Student Mobile PWA (Bottom Sheet Architecture)
- **Top Bar (Z-Index 30):** Minimal transparent status pill indicating network connection state (`[● Live 32ms]` / `[○ Reconnecting...]`) and route selector chip.
- **Middle Canvas:** Unobstructed full-bleed interactive map with automated camera framing following the student's assigned bus.
- **Interactive Drawer (Vaul / shadcn Sheet):**
  - **Snap Point 1 (Collapsed, 96px):** Current bus ETA, remaining stops count, and live status badge.
  - **Snap Point 2 (Expanded, 60% viewport):** Step-by-step stop breakdown with completed stops grayed out, current stop highlighted in emerald, and expected arrival timestamps.

```
┌──────────────────────────────────────────────┐
│  [ Route 14A - Sector 3 ]     [● LIVE 2s]    │ ◀── Top Minimal Overlay
├──────────────────────────────────────────────┤
│                                              │
│                   [ 🚍 ]                     │
│                    \                         │
│                     \ (Vector Polyline)      │
│                      \                       │
│                       [ 📍 Stop 4 ]          │
│                                              │
├──────────────────────────────────────────────┤
│  === (Drag Handle) ===                       │
│  Bus 14 • Arriving at Metro Station in 4 min │ ◀── Snap Sheet (Collapsed)
│  Next: Tech Park (08:24 AM)                  │
└──────────────────────────────────────────────┘
```

### 5.2 Driver Tracking Console (Distraction-Free Kiosk)
- **Zero Accidental Touches:** Screen uses high-contrast night-mode by default to avoid cabin glare. Buttons use a minimum touch target of 72x72px.
- **Primary Operational Button:** Single large `[TRIGGER SOS BREAKDOWN]` button. Requires a 2-second press-and-hold with a radial progress ring animation to completely eliminate accidental pocket clicks.
- **Confirmation Modal:** Pops a single 4-button selector for stranded passenger bands (`<15`, `15-30`, `30-50`, `50+`) before emitting the payload.

### 5.3 Super Admin Control Tower (Incident Room HUD)
- **Split Canvas View:** Left sidebar (360px wide) maintains an active roster of all 60–100 vehicles categorized by status (Nominal, Stale, Emergency).
- **Incident Intervention Drawer:** When an SOS triggers:
  - Map automatically flies to the disabled bus with a pulsing red target ring.
  - Canvas highlights an \(R = 5\text{km}\) circular perimeter around the coordinates.
  - Displays candidate relief buses inside the circle ranked by calculated driving ETA.
  - Single-click action: `[Authorize Diversion]` prompts the backend to push detours to candidate drivers.

---

## 6. Real-Time Telemetry Hook Integration

```typescript
// src/hooks/useTelemetryStream.ts
import { useEffect, useState, useCallback } from 'react';

export function useTelemetryStream(routeId?: string) {
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  const [fleetSnapshot, setFleetSnapshot] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'FeatureCollection') {
        setFleetSnapshot(data);
      }
    } catch (err) {
      console.error('Failed to parse SSE payload:', err);
    }
  }, []);

  useEffect(() => {
    const url = routeId 
      ? `/api/v1/telemetry/stream?routeId=${encodeURIComponent(routeId)}` 
      : '/api/v1/telemetry/stream';

    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onopen = () => setConnectionStatus('CONNECTED');
    eventSource.addEventListener('fleet-snapshot', handleMessage);
    
    eventSource.onerror = () => {
      setConnectionStatus('DISCONNECTED');
      eventSource.close();
      // Automated exponential backoff retry
      setTimeout(() => setConnectionStatus('CONNECTING'), 3000);
    };

    return () => {
      eventSource.removeEventListener('fleet-snapshot', handleMessage);
      eventSource.close();
    };
  }, [routeId, handleMessage]);

  return { connectionStatus, fleetSnapshot };
}
```

---

## 7. Quality Checklist for Coding Agents

Before committing any frontend component, verify against these rules:

- [ ] No new `maplibregl.Marker()` instances exist in live vehicle rendering files.
- [ ] All coordinates are handled as `[longitude, latitude]` for MapLibre, not `[lat, lng]`.
- [ ] Number-based strings (timers, speeds, percentages) use `tabular-nums` CSS.
- [ ] Color values use predefined `--color-status-*` design variables rather than arbitrary hex codes.
- [ ] Tap targets on mobile driver screens are at least 48x48px (standard) or 72x72px (SOS trigger).
- [ ] Map camera adjustments during live updates use `map.easeTo()` rather than abrupt `map.jumpTo()`.