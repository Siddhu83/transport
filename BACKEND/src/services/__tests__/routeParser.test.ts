import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKmlRoute,
  parseGpxRoute,
  parseRouteFile,
} from '../routeParser.js';
import {
  calculateLinearDistanceOnPolyline,
  calculateStopMetrics,
} from '../../modules/routes/routes.service.js';

describe('Route & Stop Ingestion Engine (Sprint 19)', () => {
  describe('KML Parser (Google My Maps Format)', () => {
    const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Corridor Express R-101</name>
    <description>Campus to City Center Corridor</description>
    <Placemark>
      <name>Campus Main Gate</name>
      <description>Terminal Point 1</description>
      <Point>
        <coordinates>83.4215,17.9045,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Tagarapuvalasa Junction</name>
      <Point>
        <coordinates>83.4280,17.9120,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Anandapuram Toll Gate</name>
      <Point>
        <coordinates>83.4420,17.9250,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Corridor Path</name>
      <LineString>
        <coordinates>
          83.4215,17.9045,0
          83.4250,17.9080,0
          83.4280,17.9120,0
          83.4350,17.9180,0
          83.4420,17.9250,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

    it('should parse Google My Maps KML and extract stops, route name, and polyline', () => {
      const result = parseKmlRoute(sampleKml);

      assert.equal(result.routeName, 'Corridor Express R-101');
      assert.equal(result.stops.length, 3);
      assert.equal(result.stops[0]!.name, 'Campus Main Gate');
      assert.equal(result.stops[0]!.latitude, 17.9045);
      assert.equal(result.stops[0]!.longitude, 83.4215);

      assert.equal(result.stops[1]!.name, 'Tagarapuvalasa Junction');
      assert.equal(result.stops[2]!.name, 'Anandapuram Toll Gate');

      assert.equal(result.polylineCoordinates.length, 5);
      assert.deepEqual(result.polylineCoordinates[0], [83.4215, 17.9045]);
      assert.deepEqual(result.polylineCoordinates[4], [83.442, 17.925]);
    });

    it('should fallback to connecting stop points sequentially if LineString is omitted', () => {
      const kmlWithoutLine = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Stops Only Route</name>
    <Placemark>
      <name>Stop A</name>
      <Point><coordinates>83.1,17.1,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Stop B</name>
      <Point><coordinates>83.2,17.2,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

      const result = parseKmlRoute(kmlWithoutLine);
      assert.equal(result.stops.length, 2);
      assert.equal(result.polylineCoordinates.length, 2);
      assert.deepEqual(result.polylineCoordinates[0], [83.1, 17.1]);
      assert.deepEqual(result.polylineCoordinates[1], [83.2, 17.2]);
    });
  });

  describe('GPX Parser (Standard GPS / Waypoint Track)', () => {
    const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Campus Transit GPS">
  <metadata>
    <name>North Campus Shuttle GPX</name>
  </metadata>
  <wpt lat="17.9045" lon="83.4215">
    <name>Hostel Block A</name>
  </wpt>
  <wpt lat="17.9150" lon="83.4300">
    <name>Library Terminal</name>
  </wpt>
  <trk>
    <name>Track 1</name>
    <trkseg>
      <trkpt lat="17.9045" lon="83.4215"></trkpt>
      <trkpt lat="17.9100" lon="83.4250"></trkpt>
      <trkpt lat="17.9150" lon="83.4300"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

    it('should parse GPX waypoints and track points accurately', () => {
      const result = parseGpxRoute(sampleGpx);

      assert.equal(result.routeName, 'North Campus Shuttle GPX');
      assert.equal(result.stops.length, 2);
      assert.equal(result.stops[0]!.name, 'Hostel Block A');
      assert.equal(result.stops[0]!.latitude, 17.9045);
      assert.equal(result.stops[0]!.longitude, 83.4215);

      assert.equal(result.polylineCoordinates.length, 3);
      assert.deepEqual(result.polylineCoordinates[0], [83.4215, 17.9045]);
      assert.deepEqual(result.polylineCoordinates[2], [83.43, 17.915]);
    });
  });

  describe('Unified File Parser (parseRouteFile)', () => {
    it('should detect GPX format automatically from content string', () => {
      const gpxStr = `<gpx version="1.1"><wpt lat="17.0" lon="83.0"><name>S1</name></wpt><wpt lat="17.1" lon="83.1"><name>S2</name></wpt></gpx>`;
      const res = parseRouteFile(gpxStr);
      assert.equal(res.stops.length, 2);
    });

    it('should detect KML format automatically from content string', () => {
      const kmlStr = `<kml><Placemark><name>K1</name><Point><coordinates>83.0,17.0,0</coordinates></Point></Placemark><Placemark><name>K2</name><Point><coordinates>83.1,17.1,0</coordinates></Point></Placemark></kml>`;
      const res = parseRouteFile(kmlStr);
      assert.equal(res.stops.length, 2);
    });
  });

  describe('Automated Distance & Travel Time Pipeline', () => {
    const polyline: [number, number][] = [
      [78.0, 17.0],
      [78.05, 17.0],
      [78.1, 17.0],
    ];

    it('should calculate linear distance along polyline accurately', () => {
      const distStart = calculateLinearDistanceOnPolyline(17.0, 78.0, polyline);
      assert.equal(distStart, 0);

      const distMid = calculateLinearDistanceOnPolyline(17.0, 78.05, polyline);
      assert.ok(distMid > 4.5 && distMid < 6.0);

      const distEnd = calculateLinearDistanceOnPolyline(17.0, 78.1, polyline);
      assert.ok(distEnd > 9.5 && distEnd < 12.0);
    });

    it('should sort stops and compute monotonically increasing stop orders and ETAs', () => {
      const rawStops = [
        { name: 'End Terminal', latitude: 17.0, longitude: 78.1 },
        { name: 'Origin Gate', latitude: 17.0, longitude: 78.0 },
        { name: 'Mid Junction', latitude: 17.0, longitude: 78.05 },
      ];

      const metrics = calculateStopMetrics(rawStops, polyline);

      assert.equal(metrics.length, 3);
      // Origin Gate should be ordered first
      assert.equal(metrics[0]!.name, 'Origin Gate');
      assert.equal(metrics[0]!.stopOrder, 1);
      assert.equal(metrics[0]!.distanceFromOriginKm, 0);
      assert.equal(metrics[0]!.estimatedMinutesFromStart, 0);

      // Mid Junction second
      assert.equal(metrics[1]!.name, 'Mid Junction');
      assert.equal(metrics[1]!.stopOrder, 2);
      assert.ok(metrics[1]!.distanceFromOriginKm > 0);
      assert.ok(metrics[1]!.estimatedMinutesFromStart > 0);

      // End Terminal third
      assert.equal(metrics[2]!.name, 'End Terminal');
      assert.equal(metrics[2]!.stopOrder, 3);
      assert.ok(metrics[2]!.distanceFromOriginKm > metrics[1]!.distanceFromOriginKm);
      assert.ok(metrics[2]!.estimatedMinutesFromStart > metrics[1]!.estimatedMinutesFromStart);
    });
  });
});
