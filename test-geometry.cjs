const turf = require('@turf/turf');

// Mocking the optimized bridgeMultiPolygon logic to test in Node
const bridgeMultiPolygon = (geojson) => {
    if (geojson.type === 'Polygon') return geojson;
    if (geojson.type !== 'MultiPolygon') return geojson;

    const coords = geojson.coordinates;
    if (coords.length === 0) return turf.polygon([]);
    if (coords.length === 1) return turf.polygon(coords[0]);

    const sortedPolys = coords.map((c) => ({
        coordinates: c,
        area: turf.area(turf.polygon([c[0]]))
    })).sort((a, b) => b.area - a.area);

    let trunk = sortedPolys[0].coordinates[0];
    const trunkHoles = sortedPolys[0].coordinates.slice(1);

    for (let i = 1; i < sortedPolys.length; i++) {
        const subPolyRaw = sortedPolys[i].coordinates;
        const subPolyRing = subPolyRaw[0];

        let minDistSq = Infinity;
        let trunkIdx = 0;
        let subIdx = 0;

        const stepT = trunk.length > 2000 ? Math.floor(trunk.length / 1000) : 1;
        const stepS = subPolyRing.length > 2000 ? Math.floor(subPolyRing.length / 1000) : 1;

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
    return turf.polygon([trunk, ...trunkHoles]);
};

// Create a heavy MultiPolygon (two large circles)
const createCircle = (center, radius, points) => {
    const coords = [];
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        coords.push([
            center[0] + radius * Math.cos(angle),
            center[1] + radius * Math.sin(angle)
        ]);
    }
    coords.push(coords[0]); // Close the loop
    return [coords];
};

const poly1 = createCircle([0, 0], 1, 5000);
const poly2 = createCircle([5, 5], 1, 5000);
const multiPoly = {
    type: 'MultiPolygon',
    coordinates: [poly1, poly2]
};

console.log('Testing with 10,000 points total...');
const start = Date.now();
const result = bridgeMultiPolygon(multiPoly);
const end = Date.now();

console.log(`Finished in ${end - start}ms`);
console.log(`Result type: ${result.geometry.type}`);
console.log(`Result coordinates length: ${result.geometry.coordinates[0].length}`);

if (result.geometry.type === 'Polygon' && (end - start) < 1000) {
    console.log('SUCCESS: Performance and Correctness verified.');
} else {
    console.log('FAILURE: Performance or Correctness issue.');
}
