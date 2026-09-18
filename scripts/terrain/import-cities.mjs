import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/terrain/import-cities.mjs source.geojson');
const bytes = await readFile(file), source = JSON.parse(bytes.toString());
const accepted = ['Admin-1 capital', 'Admin-1 region capital', 'Admin-0 region capital', 'Populated place', 'Populated Place'];
const cities = source.features.filter(f => accepted.includes(f.properties.FEATURECLA)).map(f => {
  const p = f.properties, [lon,lat] = f.geometry.coordinates;
  if (f.geometry.type !== 'Point' || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid city coordinates');
  return {id:String(p.NE_ID),countryIso2:p.ISO_A2,countryName:p.ADM0NAME,name:p.NAME_EN || p.NAME,
    nameLocal:p.NAME,names:{en:p.NAME_EN,uk:p.NAME_UK,ru:p.NAME_RU},lat,lon,featureClass:p.FEATURECLA,
    scalerank:p.SCALERANK,population:p.POP_MAX,source:'Natural Earth 10m Populated Places'};
});
if (new Set(cities.map(c=>c.id)).size !== cities.length) throw new Error('Duplicate city ID');
await writeFile('public/data/cities-10m.json', JSON.stringify({metadata:{source:'Natural Earth 10m Populated Places',
  version:'5.1.2',url:'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places.geojson',
  sha256:createHash('sha256').update(bytes).digest('hex'),license:'Public domain',
  coordinates:'GeoJSON Point geometry; CRS84 longitude/latitude',featureClasses:accepted,count:cities.length},cities})+'\n');
console.log(`Imported ${cities.length} non-capital cities`);
