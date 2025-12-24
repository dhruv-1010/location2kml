export type Coordinate = [number, number];

export interface Geometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: Coordinate[][] | Coordinate[][][];
}

export interface Feature {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: Geometry;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export interface CitySearchResult {
  display_name: string;
  lat: string;
  lon: string;
  osm_id: string;
  geojson?: any;
}

export type EditMode = 'accurate' | 'approximate';

export interface Layer {
  id: string;
  name: string;
  feature: Feature;
  color: string;
  visible: boolean;
  editable: boolean;
  source: 'search' | 'upload';
}
