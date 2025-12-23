import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MapComponent from './components/MapComponent';
import type { Feature, CitySearchResult, EditMode } from './types';
import { ensureSinglePolygon, convertTo2D, toKML } from './utils/geometryUtils';

const App: React.FC = () => {
  const [feature, setFeature] = useState<Feature | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('accurate');
  const [cityName, setCityName] = useState<string>('');

  const handleSearchResult = (result: CitySearchResult) => {
    if (!result.geojson) return;

    setCityName(result.display_name);

    let processedGeoJson = convertTo2D(result.geojson);

    // Always start with ensuring a single polygon using the current mode
    processedGeoJson = ensureSinglePolygon(processedGeoJson, editMode);

    const newFeature: Feature = {
      type: 'Feature',
      properties: { name: result.display_name, originalGeoJson: result.geojson },
      geometry: processedGeoJson
    };

    setFeature(newFeature);
  };

  // Re-process when mode changes
  useEffect(() => {
    if (feature && feature.properties.originalGeoJson) {
      let processed = convertTo2D(feature.properties.originalGeoJson);
      processed = ensureSinglePolygon(processed, editMode);

      setFeature(prev => prev ? ({
        ...prev,
        geometry: processed
      }) : null);
    }
  }, [editMode]);

  const handleDownloadKml = () => {
    if (!feature) return;
    const kml = toKML(feature, cityName || 'Boundary');
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cityName.split(',')[0] || 'boundary'}.kml`;
    a.click();
  };

  const handleDownloadGeoJson = () => {
    if (!feature) return;
    const geojson = JSON.stringify(feature, null, 2);
    const blob = new Blob([geojson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cityName.split(',')[0] || 'boundary'}.json`;
    a.click();
  };

  const handleClear = () => {
    setFeature(null);
    setCityName('');
  };

  return (
    <>
      <Sidebar
        onSearchResultSet={handleSearchResult}
        editMode={editMode}
        setEditMode={setEditMode}
        onDownloadKml={handleDownloadKml}
        onDownloadGeoJson={handleDownloadGeoJson}
        onClear={handleClear}
        currentCityName={cityName}
      />
      <MapComponent feature={feature} onFeatureChange={setFeature} />
    </>
  );
};

export default App;
