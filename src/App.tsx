import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MapComponent from './components/MapComponent';
import type { Feature, CitySearchResult, EditMode, Layer } from './types';
import { ensureSinglePolygon, convertTo2D, toKML, parseKML } from './utils/geometryUtils';

// Generate unique colors for layers
const generateColor = (index: number): string => {
  const colors = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
  ];
  return colors[index % colors.length];
};

const App: React.FC = () => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('accurate');
  const [isEditModeActive, setIsEditModeActive] = useState<boolean>(false);
  const [editedPoints, setEditedPoints] = useState<[number, number][] | null>(null);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  const handleSearchResult = (result: CitySearchResult) => {
    if (!result.geojson) return;

    let processedGeoJson = convertTo2D(result.geojson);
    processedGeoJson = ensureSinglePolygon(processedGeoJson, editMode);

    const newFeature: Feature = {
      type: 'Feature',
      properties: {
        name: result.display_name,
        originalGeoJson: result.geojson,
        osm_id: result.osm_id
      },
      geometry: processedGeoJson
    };

    const newLayer: Layer = {
      id: `layer-${Date.now()}-${Math.random()}`,
      name: result.display_name,
      feature: newFeature,
      color: generateColor(layers.length),
      visible: true,
      editable: true,
      source: 'search'
    };

    setLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const handleKMLUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const kmlString = e.target?.result as string;
        const features = parseKML(kmlString);
        
        if (features.length === 0) {
          alert('No valid features found in KML file');
          return;
        }

        const newLayers: Layer[] = features.map((feature, index) => {
          let processedGeoJson = convertTo2D(feature);
          processedGeoJson = ensureSinglePolygon(processedGeoJson, editMode);

          const processedFeature: Feature = {
            ...feature,
            geometry: processedGeoJson,
            properties: {
              ...feature.properties,
              originalGeoJson: feature
            }
          };

          return {
            id: `layer-${Date.now()}-${index}-${Math.random()}`,
            name: feature.properties.name || `KML Layer ${layers.length + index + 1}`,
            feature: processedFeature,
            color: generateColor(layers.length + index),
            visible: true,
            editable: true,
            source: 'upload'
          };
        });

        setLayers(prev => [...prev, ...newLayers]);
        if (newLayers.length > 0) {
          setSelectedLayerId(newLayers[0].id);
        }
      } catch (error) {
        console.error('KML parsing error:', error);
        alert('Failed to parse KML file. Please ensure it is valid.');
      }
    };
    reader.readAsText(file);
  };

  // Re-process when mode changes for layers with originalGeoJson
  useEffect(() => {
    setLayers(prev => prev.map(layer => {
      if (layer.feature.properties.originalGeoJson) {
        let processed = convertTo2D(layer.feature.properties.originalGeoJson);
        processed = ensureSinglePolygon(processed, editMode);
        return {
          ...layer,
          feature: {
            ...layer.feature,
            geometry: processed
          }
        };
      }
      return layer;
    }));
  }, [editMode]);

  const handleLayerUpdate = (layerId: string, updatedFeature: Feature) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId 
        ? { ...layer, feature: updatedFeature }
        : layer
    ));
  };

  const handleLayerDelete = (layerId: string) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (selectedLayerId === layerId) {
      const remaining = layers.filter(l => l.id !== layerId);
      setSelectedLayerId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleLayerToggleVisibility = (layerId: string) => {
    setLayers(prev => prev.map(l => 
      l.id === layerId ? { ...l, visible: !l.visible } : l
    ));
  };

  const handleDownloadKml = (layerId?: string) => {
    const targetLayer = layerId 
      ? layers.find(l => l.id === layerId)
      : selectedLayer;
    
    if (!targetLayer) {
      if (layers.length === 0) return;
      // Download all layers
      const allKml = layers.map(layer => 
        toKML(layer.feature, layer.name)
      ).join('\n');
      const blob = new Blob([allKml], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'all-layers.kml';
      a.click();
      return;
    }

    const kml = toKML(targetLayer.feature, targetLayer.name);
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetLayer.name.split(',')[0] || 'boundary'}.kml`;
    a.click();
  };

  const handleDownloadGeoJson = (layerId?: string) => {
    const targetLayer = layerId 
      ? layers.find(l => l.id === layerId)
      : selectedLayer;
    
    if (!targetLayer) {
      if (layers.length === 0) return;
      // Download all layers as FeatureCollection
      const featureCollection = {
        type: 'FeatureCollection',
        features: layers.map(l => l.feature)
      };
      const geojson = JSON.stringify(featureCollection, null, 2);
      const blob = new Blob([geojson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'all-layers.json';
      a.click();
      return;
    }

    const geojson = JSON.stringify(targetLayer.feature, null, 2);
    const blob = new Blob([geojson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetLayer.name.split(',')[0] || 'boundary'}.json`;
    a.click();
  };

  const handleClear = () => {
    setLayers([]);
    setSelectedLayerId(null);
    setIsEditModeActive(false);
    setEditedPoints(null);
  };

  const handlePointsChange = (points: [number, number][]) => {
    setEditedPoints(points);
  };

  const handleRegeneratePolygon = () => {
    if (!selectedLayerId) {
      alert('No layer selected');
      return;
    }

    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    if (!selectedLayer) {
      alert('Selected layer not found');
      return;
    }

    // Use editedPoints if available, otherwise get current points from the layer
    const pointsToUse = editedPoints || (() => {
      const geom = selectedLayer.feature.geometry;
      if (geom.type === 'Polygon') {
        const coords = geom.coordinates[0] as [number, number][];
        return coords.map(c => [c[1], c[0]] as [number, number]);
      } else if (geom.type === 'MultiPolygon') {
        const firstPoly = geom.coordinates[0];
        const coords = firstPoly[0] as [number, number][];
        return coords.map(c => [c[1], c[0]] as [number, number]);
      }
      return [] as [number, number][];
    })();

    if (pointsToUse.length < 3) {
      alert('Need at least 3 points to create a polygon');
      return;
    }

    // Ensure polygon is closed (first and last point are the same)
    const closedPoints = [...pointsToUse];
    if (closedPoints.length > 0) {
      const first = closedPoints[0];
      const last = closedPoints[closedPoints.length - 1];
      if (Math.abs(first[0] - last[0]) > 0.0001 || Math.abs(first[1] - last[1]) > 0.0001) {
        closedPoints.push([first[0], first[1]]);
      }
    }

    // Convert points to GeoJSON format (lon, lat)
    const coordinates: [number, number][] = closedPoints.map(p => [p[1], p[0]] as [number, number]);

    const updatedFeature: Feature = {
      ...selectedLayer.feature,
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates]
      }
    };

    handleLayerUpdate(selectedLayerId, updatedFeature);
    setIsEditModeActive(false);
    setEditedPoints(null);
  };

  const handleEditModeToggle = (active: boolean) => {
    setIsEditModeActive(active);
    if (active && selectedLayer) {
      // Initialize editedPoints with current feature points when entering edit mode
      const geom = selectedLayer.feature.geometry;
      if (geom.type === 'Polygon') {
        const coords = geom.coordinates[0] as [number, number][];
        const points = coords.map(c => [c[1], c[0]] as [number, number]);
        setEditedPoints(points);
      } else if (geom.type === 'MultiPolygon') {
        const firstPoly = geom.coordinates[0];
        const coords = firstPoly[0] as [number, number][];
        const points = coords.map(c => [c[1], c[0]] as [number, number]);
        setEditedPoints(points);
      }
    } else {
      // Reset edited points when exiting edit mode without regenerating
      setEditedPoints(null);
    }
  };

  return (
    <>
      <Sidebar
        layers={layers}
        selectedLayerId={selectedLayerId}
        onSelectLayer={setSelectedLayerId}
        onSearchResultSet={handleSearchResult}
        onKMLUpload={handleKMLUpload}
        editMode={editMode}
        setEditMode={setEditMode}
        onDownloadKml={handleDownloadKml}
        onDownloadGeoJson={handleDownloadGeoJson}
        onLayerDelete={handleLayerDelete}
        onLayerToggleVisibility={handleLayerToggleVisibility}
        onClear={handleClear}
        isEditModeActive={isEditModeActive}
        setIsEditModeActive={handleEditModeToggle}
        onRegeneratePolygon={handleRegeneratePolygon}
        canRegenerate={editedPoints !== null && editedPoints.length >= 3}
      />
      <MapComponent 
        layers={layers}
        selectedLayerId={selectedLayerId}
        onLayerUpdate={handleLayerUpdate}
        editMode={isEditModeActive}
        onPointsChange={handlePointsChange}
      />
    </>
  );
};

export default App;
