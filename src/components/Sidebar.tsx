import React, { useState } from 'react';
import { Search, Download, Trash2, MapPin } from 'lucide-react';
import type { CitySearchResult, EditMode } from '../types';

interface SidebarProps {
    onSearchResultSet: (result: CitySearchResult) => void;
    editMode: EditMode;
    setEditMode: (mode: EditMode) => void;
    onDownloadKml: () => void;
    onDownloadGeoJson: () => void;
    onClear: () => void;
    currentCityName?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
    onSearchResultSet,
    editMode,
    setEditMode,
    onDownloadKml,
    onDownloadGeoJson,
    onClear,
    currentCityName
}) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CitySearchResult[]>([]);
    const [loading, setLoading] = useState(false);

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

    return (
        <div className="sidebar">
            <h1>KML Builder</h1>

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

            <div className="controls">
                {currentCityName && (
                    <div style={{ marginBottom: '15px' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '4px' }}>Active City</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                            <MapPin size={16} color="var(--accent-color)" />
                            {currentCityName}
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

                <button className="btn btn-primary" onClick={onDownloadKml}>
                    <Download size={18} /> Export KML
                </button>
                <button className="btn btn-secondary" onClick={onDownloadGeoJson}>
                    <Download size={18} /> Export GeoJSON
                </button>
                <button className="btn btn-secondary" style={{ color: '#ff7b72' }} onClick={onClear}>
                    <Trash2 size={18} /> Clear Map
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
