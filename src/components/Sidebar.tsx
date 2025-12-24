import React, { useState, useRef } from 'react';
import { Search, Download, Trash2, MapPin, Upload, Eye, EyeOff, Layers } from 'lucide-react';
import type { CitySearchResult, EditMode, Layer } from '../types';

interface SidebarProps {
    layers: Layer[];
    selectedLayerId: string | null;
    onSelectLayer: (layerId: string) => void;
    onSearchResultSet: (result: CitySearchResult) => void;
    onKMLUpload: (file: File) => void;
    editMode: EditMode;
    setEditMode: (mode: EditMode) => void;
    onDownloadKml: (layerId?: string) => void;
    onDownloadGeoJson: (layerId?: string) => void;
    onLayerDelete: (layerId: string) => void;
    onLayerToggleVisibility: (layerId: string) => void;
    onClear: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    layers,
    selectedLayerId,
    onSelectLayer,
    onSearchResultSet,
    onKMLUpload,
    editMode,
    setEditMode,
    onDownloadKml,
    onDownloadGeoJson,
    onLayerDelete,
    onLayerToggleVisibility,
    onClear
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CitySearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    query
                )}&polygon_geojson=1&addressdetails=1`
            );
            const data = await response.json();
            setResults(data);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.name.endsWith('.kml')) {
            onKMLUpload(file);
        } else {
            alert('Please upload a valid KML file (.kml extension)');
        }
        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const selectedLayer = layers.find(l => l.id === selectedLayerId);

    return (
        <div className="sidebar">
            <h1>KML Builder</h1>

            <div style={{ marginBottom: '20px' }}>
                <button 
                    className="btn btn-secondary" 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ width: '100%', marginBottom: '10px' }}
                >
                    <Upload size={18} /> Upload KML
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".kml"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                />
            </div>

            <form className="search-box" onSubmit={handleSearch}>
                <Search className="search-icon" size={18} />
                <input
                    type="text"
                    placeholder="Search city (e.g. Somnath, Mumbai)"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </form>

            <div className="results-list">
                {loading && <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>}
                {results.map((result) => (
                    <div
                        key={result.osm_id}
                        className="result-item"
                        onClick={() => onSearchResultSet(result)}
                    >
                        <span className="name">{result.display_name}</span>
                        <span className="meta">OSM ID: {result.osm_id}</span>
                    </div>
                ))}
                {results.length === 0 && !loading && query && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '10px' }}>
                        No results found.
                    </div>
                )}
            </div>

            {layers.length > 0 && (
                <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                    <div style={{ 
                        color: 'var(--text-secondary)', 
                        fontSize: '0.7rem', 
                        textTransform: 'uppercase', 
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <Layers size={14} />
                        Layers ({layers.length})
                    </div>
                    <div style={{ 
                        maxHeight: '200px', 
                        overflowY: 'auto',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '4px'
                    }}>
                        {layers.map((layer) => (
                            <div
                                key={layer.id}
                                onClick={() => onSelectLayer(layer.id)}
                                style={{
                                    padding: '8px',
                                    marginBottom: '4px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    backgroundColor: selectedLayerId === layer.id 
                                        ? 'var(--accent-color)' + '20' 
                                        : 'transparent',
                                    border: selectedLayerId === layer.id 
                                        ? `1px solid ${layer.color}` 
                                        : '1px solid transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <div
                                    style={{
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '2px',
                                        backgroundColor: layer.color,
                                        flexShrink: 0
                                    }}
                                />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {layer.name}
                                </span>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onLayerToggleVisibility(layer.id);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: layer.visible ? 'var(--text-primary)' : 'var(--text-secondary)'
                                        }}
                                        title={layer.visible ? 'Hide layer' : 'Show layer'}
                                    >
                                        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onLayerDelete(layer.id);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            color: '#ff7b72'
                                        }}
                                        title="Delete layer"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="controls">
                {selectedLayer && (
                    <div style={{ marginBottom: '15px' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '4px' }}>Active Layer</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                            <div
                                style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '2px',
                                    backgroundColor: selectedLayer.color
                                }}
                            />
                            <MapPin size={16} color="var(--accent-color)" />
                            {selectedLayer.name}
                        </div>
                    </div>
                )}

                <div className="mode-toggle">
                    <button
                        className={`mode-btn ${editMode === 'accurate' ? 'active' : ''}`}
                        onClick={() => setEditMode('accurate')}
                    >
                        Accurate
                    </button>
                    <button
                        className={`mode-btn ${editMode === 'approximate' ? 'active' : ''}`}
                        onClick={() => setEditMode('approximate')}
                    >
                        Approximate
                    </button>
                </div>

                <button 
                    className="btn btn-primary" 
                    onClick={() => onDownloadKml()}
                    disabled={layers.length === 0}
                >
                    <Download size={18} /> Export KML {layers.length > 1 ? '(All)' : ''}
                </button>
                <button 
                    className="btn btn-secondary" 
                    onClick={() => onDownloadGeoJson()}
                    disabled={layers.length === 0}
                >
                    <Download size={18} /> Export GeoJSON {layers.length > 1 ? '(All)' : ''}
                </button>
                <button 
                    className="btn btn-secondary" 
                    style={{ color: '#ff7b72' }} 
                    onClick={onClear}
                    disabled={layers.length === 0}
                >
                    <Trash2 size={18} /> Clear All
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
