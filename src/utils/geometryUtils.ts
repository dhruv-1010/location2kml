import * as turf from '@turf/turf';
import type { Coordinate } from '../types';

/**
 * Converts any GeoJSON geometry to 2D by dropping Z coordinates.
 */
export const convertTo2D = (geojson: any): any => {
  return turf.truncate(geojson, { precision: 10, coordinates: 2 });
};

/**
 * Ensures a geometry is a single Polygon.
 */
export const ensureSinglePolygon = (geojson: any, mode: 'accurate' | 'approximate' = 'accurate'): any => {
  // 1. Flatten everything to a collection of polygons
  const polygons: any[] = [];
  turf.flattenEach(geojson, (feature) => {
    if (feature.geometry.type === 'Polygon') {
      polygons.push(feature.geometry.coordinates);
    }
  });

  if (polygons.length === 0) return { type: 'Polygon', coordinates: [] };
  if (polygons.length === 1 && mode === 'accurate') return { type: 'Polygon', coordinates: polygons[0] };

  let processedGeoJson: any = {
    type: 'MultiPolygon',
    coordinates: polygons
  };

  // 2. APPROXIMATE MODE: Backfill using Buffer and Union
  if (mode === 'approximate') {
    try {
      // Buffer ~200m (roughly 0.002 degrees)
      const buffered = turf.buffer(processedGeoJson, 0.2, { units: 'kilometers' });
      if (buffered) {
        // Union all parts
        let united: any = buffered;
        if (buffered.geometry?.type === 'MultiPolygon') {
          const parts = buffered.geometry.coordinates.map((poly: any) => turf.polygon(poly));
          if (parts.length > 1) {
            let combined: any = parts[0];
            for (let i = 1; i < parts.length; i++) {
              const unionResult = turf.union(turf.featureCollection([combined, parts[i]]));
              if (unionResult) combined = unionResult;
            }
            united = combined;
          }
        }

        // Buffer back by -200m
        const shrunk = turf.buffer(united, -0.2, { units: 'kilometers' });
        if (shrunk) {
          processedGeoJson = turf.simplify(shrunk, { tolerance: 0.0005, highQuality: true }).geometry;
        }
      }
    } catch (e) {
      console.warn("Backfill failed, falling back to bridging", e);
    }
  }

  // 3. Bridge remaining parts into a single Polygon
  return bridgeMultiPolygon(processedGeoJson);
};

/**
 * Bridges a MultiPolygon into a single Polygon by connecting rings.
 */
const bridgeMultiPolygon = (geojson: any): any => {
  // Flatten to be sure we have Polygons
  const polygons: any[] = [];
  turf.flattenEach(geojson, (feature) => {
    if (feature.geometry.type === 'Polygon') {
      // Filter out rings with < 4 points (turf.polygon requirement)
      const validRings = feature.geometry.coordinates.filter((ring: any) => ring.length >= 4);
      if (validRings.length > 0) {
        polygons.push(validRings);
      }
    }
  });

  if (polygons.length === 0) return { type: 'Polygon', coordinates: [[]] };
  if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] };

  // Sort by area (outer ring)
  const sortedPolys = polygons.map((p: any) => ({
    coordinates: p,
    area: turf.area(turf.polygon([p[0]]))
  })).sort((a: any, b: any) => b.area - a.area);

  let trunk = sortedPolys[0].coordinates[0]; // Outer ring of largest polygon
  const trunkHoles = sortedPolys[0].coordinates.slice(1);

  for (let i = 1; i < sortedPolys.length; i++) {
    const subPolyRing = sortedPolys[i].coordinates[0];

    let minDistSq = Infinity;
    let trunkIdx = 0;
    let subIdx = 0;

    const stepT = trunk.length > 1000 ? Math.floor(trunk.length / 500) : 1;
    const stepS = subPolyRing.length > 1000 ? Math.floor(subPolyRing.length / 500) : 1;

    for (let t = 0; t < trunk.length; t += stepT) {
      const p1 = trunk[t];
      for (let s = 0; s < subPolyRing.length; s += stepS) {
        const p2 = subPolyRing[s];
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        const d2 = dx * dx + dy * dy;
        if (d2 < minDistSq) {
          minDistSq = d2;
          trunkIdx = t;
          subIdx = s;
        }
      }
    }

    trunk = [
      ...trunk.slice(0, trunkIdx + 1),
      ...subPolyRing.slice(subIdx),
      ...subPolyRing.slice(0, subIdx + 1),
      ...trunk.slice(trunkIdx)
    ];
  }

  return {
    type: 'Polygon',
    coordinates: [trunk, ...trunkHoles]
  };
};

/**
 * Generates a simple KML string from GeoJSON.
 */
export const toKML = (geojson: any, name: string = 'Boundary'): string => {
  // const coordinates = turf.getCoords(geojson);

  // Flatten for KML format: lon,lat,0
  const coordString = (coords: Coordinate[]) =>
    coords.map(c => `${c[0]},${c[1]},0`).join(' ');

  const polygonToKML = (rings: Coordinate[][]) => `
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordString(rings[0])}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
        ${rings.slice(1).map((ring: Coordinate[]) => `
          <innerBoundaryIs>
            <LinearRing>
              <coordinates>${coordString(ring)}</coordinates>
            </LinearRing>
          </innerBoundaryIs>
        `).join('')}
      </Polygon>`;

  let geometryKml = '';
  const geom = geojson.geometry;

  if (geom.type === 'Polygon') {
    geometryKml = polygonToKML(geom.coordinates);
  } else if (geom.type === 'MultiPolygon') {
    geometryKml = `
      <MultiGeometry>
        ${geom.coordinates.map((polyCoords: Coordinate[][]) => polygonToKML(polyCoords)).join('')}
      </MultiGeometry>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Placemark>
      <name>${name}</name>
      ${geometryKml}
    </Placemark>
  </Document>
</kml>`;
};
