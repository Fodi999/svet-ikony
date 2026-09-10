// Sources: Natural Earth v5.1.2 ne_50m_admin_0_countries / ne_50m_populated_places.
// Usage: node scripts/prepare-country-interaction.mjs countries.geojson places.geojson
import fs from 'node:fs';
const countries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const places = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).features.map(f => f.properties);
const metadata = {};
const round = c => c.map(v => Array.isArray(v) ? round(v) : Math.round(v * 1000) / 1000);
const valid = v => v && v !== '-99' ? v : null;
for (const f of countries.features) {
  const p = f.properties;
  const iso2 = valid(p.ISO_A2_EH), iso3 = valid(p.ISO_A3_EH);
  const code = iso2 || iso3;
  if (code) {
    // CAPALT alone also includes seats of government/alternative claims;
    // do not label those cities as additional capitals.
    const capitals = places.filter(c => c.ADM0_A3 === p.ADM0_A3 && c.ADM0CAP === 1);
    metadata[code] = { code, iso2, iso3, name: {uk:p.NAME_UK || p.ADMIN,ru:p.NAME_RU || p.ADMIN,en:p.NAME_EN || p.ADMIN}, continent:p.CONTINENT,
      capital: capitals.length ? Object.fromEntries(['uk','ru','en'].map(l => [l,[...new Set(capitals.map(c => c['NAME_'+l.toUpperCase()] || c.NAME))].join(' / ')])) : null,
      representative: [p.LABEL_X,p.LABEL_Y] };
  }
  f.properties = {name:p.ADMIN, code};
  f.geometry.coordinates = round(f.geometry.coordinates);
}
fs.writeFileSync(new URL('../public/data/country-borders-50m.geojson',import.meta.url),JSON.stringify(countries));
fs.writeFileSync(new URL('../lib/visualizer/country-metadata.json',import.meta.url),JSON.stringify(metadata));
