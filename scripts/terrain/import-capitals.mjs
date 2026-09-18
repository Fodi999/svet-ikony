import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/terrain/import-capitals.mjs source.geojson');
const bytes = await readFile(file);
const source = JSON.parse(bytes.toString());
const accepted = ['Admin-0 capital', 'Admin-0 capital alt'];
const capitals = source.features.filter(f => accepted.includes(f.properties.FEATURECLA)).map(f => {
  const p = f.properties, [lon, lat] = f.geometry.coordinates;
  if (f.geometry.type !== 'Point' || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid source point');
  return { id: String(p.NE_ID), countryIso2: p.ISO_A2, countryName: p.ADM0NAME,
    name: p.NAME_EN || p.NAME, nameLocal: p.NAME, names: { en: p.NAME_EN, uk: p.NAME_UK, ru: p.NAME_RU },
    lat, lon, featureClass: p.FEATURECLA, scalerank: p.SCALERANK, population: p.POP_MAX,
    source: 'Natural Earth 10m Populated Places',
    provenance: { neId: p.NE_ID, adm0A3: p.ADM0_A3, sovereignName: p.SOV0NAME, sovereignA3: p.SOV_A3,
      adm0cap: p.ADM0CAP, capalt: p.CAPALT, capin: p.CAPIN, note: p.NOTE,
      attributeLatitude: p.LATITUDE, attributeLongitude: p.LONGITUDE, wikidataId: p.WIKIDATAID,
      classifications: Object.fromEntries(Object.entries(p).filter(([key, value]) => key.startsWith('FCLASS_') && value != null)) } };
}).sort((a,b) => a.scalerank - b.scalerank || b.population - a.population || a.id.localeCompare(b.id));
if (new Set(capitals.map(c => c.id)).size !== capitals.length) throw new Error('Duplicate NE_ID');
const output = { metadata: { source: 'Natural Earth 10m Populated Places', version: '5.1.2',
  homepage: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places.geojson',
  sha256: createHash('sha256').update(bytes).digest('hex'), license: 'Public domain',
  coordinates: 'GeoJSON Point geometry; CRS84 longitude/latitude, degrees',
  featureClasses: accepted, populationField: 'POP_MAX (source estimate, not a current census)',
  nameLocalField: 'NAME (source default name; not guaranteed endonym)', count: capitals.length }, capitals };
await mkdir('public/data', { recursive: true });
await writeFile('public/data/capitals-10m.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ count: capitals.length, classes: accepted.map(c => [c, capitals.filter(p => p.featureClass === c).length]), sha256: output.metadata.sha256 }));
