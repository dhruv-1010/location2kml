import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature } from '../types';

// Fix for default marker icons in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
    feature: Feature | null;
    onFeatureChange: (feature: Feature) => void;
}

const FitBounds: React.FC<{ feature: Feature | null }> = ({ feature }) => {
    const map = useMap();
    useEffect(() => {
        if (feature && feature.geometry) {
            const geojsonLayer = L.geoJSON(feature as any);
            map.fitBounds(geojsonLayer.getBounds());
        }
    }, [feature, map]);
    return null;
};

const MapComponent: React.FC<MapComponentProps> = ({ feature, onFeatureChange }) => {
    const [points, setPoints] = useState<[number, number][]>([]);

    useEffect(() => {
        if (feature && feature.geometry) {
            const geom = feature.geometry;
            if (geom.type === 'Polygon') {
                const coords = geom.coordinates[0] as [number, number][];
                setPoints(coords.map(c => [c[1], c[0]]));
            } else if (geom.type === 'MultiPolygon') {
                // For MultiPolygon, we'll only allow editing the first (usually largest) polygon for now
                // but we show all points if below threshold
                const firstPoly = geom.coordinates[0];
                const coords = firstPoly[0] as [number, number][];
                setPoints(coords.map(c => [c[1], c[0]]));
            } else {
                setPoints([]);
            }
        } else {
            setPoints([]);
        }
    }, [feature]);

    const handleDrag = (index: number, newLatLng: L.LatLng) => {
        const newPoints = [...points];
        newPoints[index] = [newLatLng.lat, newLatLng.lng];

        if (index === 0) newPoints[newPoints.length - 1] = [newLatLng.lat, newLatLng.lng];
        if (index === newPoints.length - 1) newPoints[0] = [newLatLng.lat, newLatLng.lng];

        setPoints(newPoints);

        if (feature) {
            const geom = feature.geometry;
            let newCoordinates: any;

            if (geom.type === 'Polygon') {
                newCoordinates = [newPoints.map(p => [p[1], p[0]])];
            } else if (geom.type === 'MultiPolygon') {
                // Update only the first polygon's outer ring
                newCoordinates = [...geom.coordinates];
                newCoordinates[0] = [newPoints.map(p => [p[1], p[0]]), ...newCoordinates[0].slice(1)];
            }

            const updatedFeature: Feature = {
                ...feature,
                geometry: {
                    ...geom,
                    coordinates: newCoordinates
                } as any
            };
            onFeatureChange(updatedFeature);
        }
    };

    const vertexIcon = L.divIcon({
        className: 'vertex-marker',
        html: '<div style="background-color: var(--accent-color); width: 8px; height: 8px; border-radius: 50%; border: 2px solid white;"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    return (
        <div className="map-container">
            <MapContainer
                center={[20, 0]}
                zoom={2}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {feature && <GeoJSON data={feature as any} style={{ color: 'var(--accent-color)', weight: 2, fillOpacity: 0.2 }} />}

                {points.length > 0 && points.length < 500 && points.map((p, i) => (
                    <Marker
                        key={`${i}-${p[0]}-${p[1]}`}
                        position={p}
                        draggable={true}
                        icon={vertexIcon}
                        eventHandlers={{
                            dragend: (e) => handleDrag(i, e.target.getLatLng())
                        }}
                    />
                ))}

                <FitBounds feature={feature} />
            </MapContainer>
        </div>
    );
};

export default MapComponent;
