import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { capitalName, capitalPosition, capitalSize, cityRankLimit, collisionFreeLabels, parseCapitals, parseCities } from './capital-cities';
import { latLngToVector3 } from './geography';

const dataset=JSON.parse(readFileSync('public/data/capitals-10m.json','utf8'));
const capitals=parseCapitals(dataset);
describe('capital cities source and layout',()=>{
  it('contains only the two explicit national capital classes with source provenance',()=>{
    expect(capitals).toHaveLength(215);
    expect(new Set(capitals.map(c=>c.id)).size).toBe(215);
    expect(dataset.metadata.version).toBe('5.1.2');
    expect(dataset.metadata.sha256).toBe('9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b');
    expect(capitals.filter(c=>c.featureClass==='Admin-0 capital alt')).toHaveLength(13);
  });
  it.each(['Paris','London','Madrid','Rome','Bern','Vienna','Berlin','Prague','Warsaw','Kyiv','Athens'])('places %s through the existing geographic frame without longitude drift',name=>{
    const city=capitals.find(c=>c.name===name)!; expect(city).toBeDefined();
    const point=capitalPosition(city,1.8,null);
    expect(point.clone().normalize().distanceTo(latLngToVector3(city.lat,city.lon,1))).toBeLessThan(1e-12);
    expect(Math.asin(point.y/point.length())*180/Math.PI).toBeCloseTo(city.lat,10);
    expect(Math.atan2(point.x,point.z)*180/Math.PI).toBeCloseTo(city.lon,10);
    expect((point.length()/1.8-1)*6371000).toBeCloseTo(30,6);
  });
  it('adds DEM elevation without changing latitude/longitude',()=>{
    const city=capitals[0], point=capitalPosition(city,1.8,2356);
    expect((point.length()/1.8-1)*6371000).toBeCloseTo(2386,6);
    expect(point.clone().normalize().distanceTo(capitalPosition(city,1.8,null).normalize())).toBeLessThan(1e-12);
  });
  it('shrinks continuously toward the surface and clamps at 4..5 pixels',()=>{
    let previous=0;
    for(const altitude of [0,10,1000,10000,100000,1000000,10000000,100000000]) {
      const size=capitalSize(altitude);expect(size).toBeGreaterThanOrEqual(previous);expect(size).toBeGreaterThanOrEqual(4);expect(size).toBeLessThanOrEqual(5);previous=size;
    }
    expect(Math.abs(capitalSize(1000001)-capitalSize(1000000))).toBeLessThan(0.001);
  });
  it('retains priority with collision hysteresis, never overlapping labels',()=>{
    const a={id:'a',x:0,y:0,width:50,height:18}, b={id:'b',x:55,y:0,width:50,height:18};
    expect(collisionFreeLabels([a,b],new Set()).map(b=>b.id)).toEqual(['a']);
    expect(collisionFreeLabels([a,b],new Set(['a','b'])).map(b=>b.id)).toEqual(['a','b']);
    expect(collisionFreeLabels([a,{...b,x:45}],new Set(['b'])).map(b=>b.id)).toEqual(['a']);
  });
  it('uses localized source names and rejects ordinary cities',()=>{
    expect(capitalName(capitals.find(c=>c.name==='Paris')!,'uk')).toBe('Париж');
    expect(()=>parseCapitals({capitals:[{...capitals[0],featureClass:'Populated place'}]})).toThrow();
  });
  it('imports ordinary cities separately without duplicating national capitals',()=>{
    const data=JSON.parse(readFileSync('public/data/cities-10m.json','utf8'));
    const cities=parseCities(data), ids=new Set(capitals.map(c=>c.id));
    expect(cities.length).toBe(data.metadata.count);
    expect(cities.length).toBeGreaterThan(7000);
    expect(new Set(cities.map(c=>c.id)).size).toBe(cities.length);
    expect(cities.some(c=>ids.has(c.id))).toBe(false);
    expect(cities.find(c=>c.name==='Lyon')).toBeDefined();
    expect(()=>parseCities({cities:[capitals[0]]})).toThrow();
    expect(cityRankLimit(200001)).toBe(-1);
    expect(cityRankLimit(200000)).toBe(4);
    expect(cityRankLimit(80000)).toBe(7);
    expect(cityRankLimit(25000)).toBe(10);
  });
});
