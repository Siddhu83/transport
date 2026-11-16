/**
 * KML & GPX Geometry & Transit Stop Parser (Sprint 19)
 * Extracts sequential bus stops and road polylines from Google My Maps and GPS XML tracks.
 */

export interface ParsedStop {
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
}

export interface ParsedRouteResult {
  routeName?: string;
  stops: ParsedStop[];
  polylineCoordinates: [number, number][]; // [[lng, lat], ...]
}

/**
 * Parses coordinate tuples string "lng,lat,alt lng,lat,alt ..." into [[lng, lat], ...]
 */
function parseCoordinateTuples(rawCoords: string): [number, number][] {
  const result: [number, number][] = [];
  const tokens = rawCoords.trim().split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;
    const parts = token.split(',');
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]!);
      const lat = parseFloat(parts[1]!);
      if (!isNaN(lng) && !isNaN(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        result.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
      }
    }
  }

  return result;
}

/**
 * Parses a Google My Maps KML export file
 */
export function parseKmlRoute(kmlContent: string): ParsedRouteResult {
  const stops: ParsedStop[] = [];
  let polylineCoordinates: [number, number][] = [];

  // 1. Extract Document/Folder Name
  let routeName: string | undefined;
  const docNameMatch = kmlContent.match(/<Document[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  if (docNameMatch && docNameMatch[1]) {
    routeName = docNameMatch[1].trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
  }

  // 2. Extract Placemark Blocks
  const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/gi;
  const placemarks = kmlContent.match(placemarkRegex) || [];

  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i]!;

    // Extract Name
    let name = `Stop ${stops.length + 1}`;
    const nameMatch = pm.match(/<name>([\s\S]*?)<\/name>/i);
    if (nameMatch && nameMatch[1]) {
      name = nameMatch[1].trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    }

    // Extract Description
    let description: string | undefined;
    const descMatch = pm.match(/<description>([\s\S]*?)<\/description>/i);
    if (descMatch && descMatch[1]) {
      description = descMatch[1].trim().replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    }

    // Check if Point (Stop marker)
    const pointMatch = pm.match(/<Point[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i);
    if (pointMatch && pointMatch[1]) {
      const coords = parseCoordinateTuples(pointMatch[1]);
      if (coords.length > 0) {
        const [lng, lat] = coords[0]!;
        stops.push({
          name,
          latitude: lat,
          longitude: lng,
          description,
        });
      }
      continue;
    }

    // Check if LineString (Corridor polyline)
    const lineMatch = pm.match(/<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/i);
    if (lineMatch && lineMatch[1]) {
      const lineCoords = parseCoordinateTuples(lineMatch[1]);
      if (lineCoords.length > 0) {
        polylineCoordinates.push(...lineCoords);
      }
    }
  }

  // Fallback: If no LineString found, check root for any LineString
  if (polylineCoordinates.length === 0) {
    const standaloneLineMatch = kmlContent.match(/<LineString[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/i);
    if (standaloneLineMatch && standaloneLineMatch[1]) {
      polylineCoordinates = parseCoordinateTuples(standaloneLineMatch[1]);
    }
  }

  // If still no polyline, connect stops sequentially
  if (polylineCoordinates.length === 0 && stops.length > 0) {
    polylineCoordinates = stops.map((s) => [s.longitude, s.latitude]);
  }

  return {
    routeName,
    stops,
    polylineCoordinates,
  };
}

/**
 * Parses a standard GPX file
 */
export function parseGpxRoute(gpxContent: string): ParsedRouteResult {
  const stops: ParsedStop[] = [];
  const polylineCoordinates: [number, number][] = [];

  // 1. Extract Route/Metadata Name
  let routeName: string | undefined;
  const nameMatch = gpxContent.match(/<(?:metadata|trk|rte)[\s\S]*?<name>([\s\S]*?)<\/name>/i);
  if (nameMatch && nameMatch[1]) {
    routeName = nameMatch[1].trim();
  }

  // 2. Extract Waypoints (<wpt lat="..." lon="...">) as stops
  const wptRegex = /<wpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/wpt>/gi;
  let wptMatch: RegExpExecArray | null;

  while ((wptMatch = wptRegex.exec(gpxContent)) !== null) {
    const lat = parseFloat(wptMatch[1]!);
    const lng = parseFloat(wptMatch[2]!);
    const body = wptMatch[3]!;

    let name = `Stop ${stops.length + 1}`;
    const wptName = body.match(/<name>([\s\S]*?)<\/name>/i);
    if (wptName && wptName[1]) {
      name = wptName[1].trim();
    }

    let description: string | undefined;
    const descMatch = body.match(/<desc>([\s\S]*?)<\/desc>/i);
    if (descMatch && descMatch[1]) {
      description = descMatch[1].trim();
    }

    if (!isNaN(lat) && !isNaN(lng)) {
      stops.push({
        name,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        description,
      });
    }
  }

  // 3. Extract Track Points (<trkpt lat="..." lon="...">) or Route Points (<rtept ...>)
  const ptRegex = /<(?:trkpt|rtept)\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["']/gi;
  let ptMatch: RegExpExecArray | null;

  while ((ptMatch = ptRegex.exec(gpxContent)) !== null) {
    const lat = parseFloat(ptMatch[1]!);
    const lng = parseFloat(ptMatch[2]!);
    if (!isNaN(lat) && !isNaN(lng)) {
      polylineCoordinates.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
    }
  }

  // Fallback: If no track points found, connect waypoints sequentially
  if (polylineCoordinates.length === 0 && stops.length > 0) {
    for (const stop of stops) {
      polylineCoordinates.push([stop.longitude, stop.latitude]);
    }
  }

  return {
    routeName,
    stops,
    polylineCoordinates,
  };
}

/**
 * Unified Parser detecting format from XML header and content
 */
export function parseRouteFile(content: string, typeHint?: 'kml' | 'gpx'): ParsedRouteResult {
  const isGpx = typeHint === 'gpx' || /<gpx[\s>]/i.test(content);
  if (isGpx) {
    return parseGpxRoute(content);
  }
  return parseKmlRoute(content);
}
