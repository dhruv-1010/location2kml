import * as turf from '@turf/turf';
import type { Coordinate, Feature } from '../types';

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

/**
 * Parses KML string to GeoJSON Feature(s)
 */
export const parseKML = (kmlString: string): Feature[] => {
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlString, 'text/xml');
  
  // Check for parsing errors
  const parseError = kmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid KML format');
  }

  const features: Feature[] = [];
  const namespace = 'http://www.opengis.net/kml/2.2';
  
  // Helper to get text content with namespace
  const getText = (element: Element | null, tagName: string): string => {
    if (!element) return '';
    const el = element.getElementsByTagNameNS(namespace, tagName)[0] || 
               element.getElementsByTagName(tagName)[0];
    return el?.textContent?.trim() || '';
  };

  // Helper to parse coordinates string to a single ring
  const parseCoordinates = (coordString: string): Coordinate[] => {
    const coords = coordString.trim().split(/\s+/).filter(c => c.trim());
    const points: Coordinate[] = coords.map(c => {
      const parts = c.split(',');
      const lon = parseFloat(parts[0]) || 0;
      const lat = parseFloat(parts[1]) || 0;
      return [lon, lat];
    });
    
    // Close the ring if not already closed
    if (points.length > 0) {
      const first = points[0];
      const last = points[points.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        points.push([first[0], first[1]]);
      }
    }
    
    return points;
  };

  // Process Placemarks
  const placemarks = kmlDoc.getElementsByTagNameNS(namespace, 'Placemark') || 
                     kmlDoc.getElementsByTagName('Placemark');
  
  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    const name = getText(placemark, 'name') || `Placemark ${i + 1}`;
    
    // Check for Polygon
    const polygon = placemark.getElementsByTagNameNS(namespace, 'Polygon')[0] ||
                    placemark.getElementsByTagName('Polygon')[0];
    
    if (polygon) {
      const outerRing = polygon.getElementsByTagNameNS(namespace, 'outerBoundaryIs')[0] ||
                        polygon.getElementsByTagName('outerBoundaryIs')[0];
      const innerRings = polygon.getElementsByTagNameNS(namespace, 'innerBoundaryIs') ||
                         polygon.getElementsByTagName('innerBoundaryIs');
      
      const outerCoords = getText(outerRing, 'coordinates');
      if (outerCoords) {
        const rings: Coordinate[][] = [parseCoordinates(outerCoords)];
        
        // Add inner rings (holes)
        for (let j = 0; j < innerRings.length; j++) {
          const innerCoords = getText(innerRings[j], 'coordinates');
          if (innerCoords) {
            rings.push(parseCoordinates(innerCoords));
          }
        }
        
        const feature: Feature = {
          type: 'Feature',
          properties: {
            name,
            source: 'kml'
          },
          geometry: {
            type: 'Polygon',
            coordinates: rings
          }
        };
        features.push(feature);
      }
    }
    
    // Check for MultiGeometry
    const multiGeometry = placemark.getElementsByTagNameNS(namespace, 'MultiGeometry')[0] ||
                          placemark.getElementsByTagName('MultiGeometry')[0];
    
    if (multiGeometry) {
      const polygons = multiGeometry.getElementsByTagNameNS(namespace, 'Polygon') ||
                       multiGeometry.getElementsByTagName('Polygon');
      
      if (polygons.length > 0) {
        const multiPolyCoords: Coordinate[][][] = [];
        
        for (let j = 0; j < polygons.length; j++) {
          const poly = polygons[j];
          const outerRing = poly.getElementsByTagNameNS(namespace, 'outerBoundaryIs')[0] ||
                            poly.getElementsByTagName('outerBoundaryIs')[0];
          const innerRings = poly.getElementsByTagNameNS(namespace, 'innerBoundaryIs') ||
                             poly.getElementsByTagName('innerBoundaryIs');
          
          const outerCoords = getText(outerRing, 'coordinates');
          if (outerCoords) {
            const rings: Coordinate[][] = [parseCoordinates(outerCoords)];
            
            // Add inner rings
            for (let k = 0; k < innerRings.length; k++) {
              const innerCoords = getText(innerRings[k], 'coordinates');
              if (innerCoords) {
                rings.push(parseCoordinates(innerCoords));
              }
            }
            
            multiPolyCoords.push(rings);
          }
        }
        
        if (multiPolyCoords.length > 0) {
          const feature: Feature = {
            type: 'Feature',
            properties: {
              name,
              source: 'kml'
            },
            geometry: {
              type: 'MultiPolygon',
              coordinates: multiPolyCoords
            }
          };
          features.push(feature);
        }
      }
    }
  }
  
  // If no Placemarks found, check Document level
  if (features.length === 0) {
    const document = kmlDoc.getElementsByTagNameNS(namespace, 'Document')[0] ||
                     kmlDoc.getElementsByTagName('Document')[0];
    if (document) {
      // Recursively parse Document's children
      const docPlacemarks = document.getElementsByTagNameNS(namespace, 'Placemark') ||
                            document.getElementsByTagName('Placemark');
      // This would be handled by the above loop, but if Document wraps them differently...
    }
  }
  
  return features;
};
