import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, Layer } from '../types';

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
    layers: Layer[];
    selectedLayerId: string | null;
    onLayerUpdate: (layerId: string, feature: Feature) => void;
    editMode: boolean;
    onPointsChange?: (points: [number, number][]) => void;
}

const FitBounds: React.FC<{ layers: Layer[] }> = ({ layers }) => {
    const map = useMap();
    useEffect(() => {
        const visibleLayers = layers.filter(l => l.visible);
        if (visibleLayers.length > 0) {
            const bounds = L.latLngBounds([]);
            visibleLayers.forEach(layer => {
                if (layer.feature && layer.feature.geometry) {
                    const geojsonLayer = L.geoJSON(layer.feature as any);
                    bounds.extend(geojsonLayer.getBounds());
                }
            });
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [layers, map]);
    return null;
};

// Custom draggable marker component that prevents position updates during drag
const DraggableMarker: React.FC<{
    position: [number, number];
    index: number;
    icon: L.DivIcon;
    hoverIcon: L.DivIcon;
    onDragEnd: (index: number, latLng: L.LatLng) => void;
}> = ({ position, index, icon, hoverIcon, onDragEnd }) => {
    const markerRef = useRef<L.Marker | null>(null);
    const isDraggingRef = useRef(false);

    // Only update position if not dragging
    useEffect(() => {
        if (!isDraggingRef.current && markerRef.current) {
            markerRef.current.setLatLng(position);
        }
    }, [position]);

    return (
        <Marker
            position={position}
            draggable={true}
            icon={icon}
            zIndexOffset={1000}
            eventHandlers={{
                dragstart: () => {
                    isDraggingRef.current = true;
                },
                dragend: (e: L.DragEndEvent) => {
                    const marker = e.target as L.Marker;
                    const latLng = marker.getLatLng();
                    isDraggingRef.current = false;
                    onDragEnd(index, latLng);
                },
                mouseover: (e: L.LeafletMouseEvent) => {
                    const marker = e.target as L.Marker;
                    marker.setIcon(hoverIcon);
                },
                mouseout: (e: L.LeafletMouseEvent) => {
                    const marker = e.target as L.Marker;
                    marker.setIcon(icon);
                }
            }}
            ref={(ref) => {
                markerRef.current = ref;
            }}
        />
    );
};

const MapComponent: React.FC<MapComponentProps> = ({ layers, selectedLayerId, editMode, onPointsChange }) => {
    const [points, setPoints] = useState<[number, number][]>([]);
    
    const selectedLayer = layers.find(l => l.id === selectedLayerId);
    const feature = selectedLayer?.feature || null;

    // Extract points from feature - only when feature changes, not onPointsChange
    useEffect(() => {
        if (feature && feature.geometry) {
            const geom = feature.geometry;
            if (geom.type === 'Polygon') {
                const coords = geom.coordinates[0] as [number, number][];
                if (coords && coords.length > 0) {
                    const newPoints: [number, number][] = coords.map(c => [c[1], c[0]] as [number, number]);
                    setPoints(newPoints);
                    if (onPointsChange) {
                        onPointsChange(newPoints);
                    }
                } else {
                    setPoints([]);
                    if (onPointsChange) {
                        onPointsChange([]);
                    }
                }
            } else if (geom.type === 'MultiPolygon') {
                const firstPoly = geom.coordinates[0];
                if (firstPoly && firstPoly[0]) {
                    const coords = firstPoly[0] as [number, number][];
                    const newPoints: [number, number][] = coords.map(c => [c[1], c[0]] as [number, number]);
                    setPoints(newPoints);
                    if (onPointsChange) {
                        onPointsChange(newPoints);
                    }
                } else {
                    setPoints([]);
                    if (onPointsChange) {
                        onPointsChange([]);
                    }
                }
            } else {
                setPoints([]);
                if (onPointsChange) {
                    onPointsChange([]);
                }
            }
        } else {
            setPoints([]);
            if (onPointsChange) {
                onPointsChange([]);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feature]); // Only depend on feature, not onPointsChange

    const handleDragEnd = useCallback((index: number, newLatLng: L.LatLng) => {
        setPoints(prevPoints => {
            const newPoints = [...prevPoints];
            newPoints[index] = [newLatLng.lat, newLatLng.lng];

            // Keep first and last point in sync for closed polygons
            if (index === 0 && newPoints.length > 1) {
                newPoints[newPoints.length - 1] = [newLatLng.lat, newLatLng.lng];
            }
            if (index === newPoints.length - 1 && newPoints.length > 1) {
                newPoints[0] = [newLatLng.lat, newLatLng.lng];
            }

            if (onPointsChange) {
                onPointsChange(newPoints);
            }

            return newPoints;
        });
    }, [onPointsChange]);


    // Memoize icons to prevent recreation
    const vertexIcon = useMemo(() => L.divIcon({
        className: 'vertex-marker',
        html: '<div style="background-color: #58a6ff; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 0 2px rgba(88,166,255,0.3); cursor: move;"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    }), []);

    const vertexIconHover = useMemo(() => L.divIcon({
        className: 'vertex-marker-hover',
        html: '<div style="background-color: #7bb3ff; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 12px rgba(88,166,255,0.8), 0 0 0 3px rgba(88,166,255,0.5); cursor: move;"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    }), []);

    // Optimize: For polygons with many points, sample them for display
    const { visiblePoints, indexMap } = useMemo(() => {
        if (points.length <= 500) {
            return { 
                visiblePoints: points, 
                indexMap: points.map((_, i) => i) 
            };
        }
        // Sample points: show every Nth point to keep performance reasonable
        const step = Math.ceil(points.length / 500);
        const visible: [number, number][] = [];
        const map: number[] = [];
        
        for (let i = 0; i < points.length; i++) {
            if (i === 0 || i === points.length - 1 || i % step === 0) {
                visible.push(points[i]);
                map.push(i);
            }
        }
        return { visiblePoints: visible, indexMap: map };
    }, [points]);

    return (
        <div className="map-container">
            <MapContainer
                center={[20, 0] as [number, number]}
                zoom={2}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {layers.filter(l => l.visible).map((layer) => (
                    <GeoJSON
                        key={layer.id}
                        data={layer.feature as any}
                        style={() => ({ 
                            color: layer.color, 
                            weight: selectedLayerId === layer.id ? 3 : 2, 
                            fillOpacity: selectedLayerId === layer.id ? 0.3 : 0.15,
                            opacity: selectedLayerId === layer.id ? 1 : 0.7
                        })}
                    />
                ))}

                {selectedLayer && selectedLayer.editable && editMode && visiblePoints.length > 0 && visiblePoints.map((p, visibleIndex) => {
                    const actualIndex = indexMap[visibleIndex];
                    
                    // Skip duplicate last point if it's the same as first
                    if (actualIndex === points.length - 1 && points.length > 1 && 
                        Math.abs(p[0] - points[0][0]) < 0.0001 && Math.abs(p[1] - points[0][1]) < 0.0001) {
                        return null;
                    }
                    
                    return (
                        <DraggableMarker
                            key={`edit-${actualIndex}`}
                            position={p}
                            index={actualIndex}
                            icon={vertexIcon}
                            hoverIcon={vertexIconHover}
                            onDragEnd={handleDragEnd}
                        />
                    );
                })}

                <FitBounds layers={layers} />
            </MapContainer>
        </div>
    );
};

export default MapComponent;
