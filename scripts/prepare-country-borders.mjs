// Input: Natural Earth v5.1.2 geojson/ne_50m_admin_0_countries.geojson.
// Usage: node scripts/prepare-country-borders.mjs /path/to/download.geojson
import { readFileSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const round = (coordinates) => coordinates.map((value) => Array.isArray(value) ? round(value) : Math.round(value * 1000) / 1000);
const data = { type: 'FeatureCollection', features: source.features.map(({ geometry, properties }) => ({
  type: 'Feature', properties: { name: properties.ADMIN }, geometry: { type: geometry.type, coordinates: round(geometry.coordinates) },
})) };
writeFileSync(new URL('../public/data/country-borders-50m.geojson', import.meta.url), JSON.stringify(data));
