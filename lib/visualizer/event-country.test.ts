import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getCountryAtLatLng, prepareCountryIndex } from './countries';
import type { CountryData } from './country-borders';
import { distanceToBoundarySegmentKm, distanceToCountryBoundaryKm, getNearestCountryAtLatLng, resolveEventCountry } from './event-country';
const data=JSON.parse(fs.readFileSync('public/data/country-borders-50m.geojson','utf8')) as CountryData;
const index=prepareCountryIndex(data);
const square=(x:number,y:number,size=.02):[number,number][]=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
const fixture=(features:CountryData['features'])=>prepareCountryIndex({type:'FeatureCollection',features});
const feature=(code:string,rings:[number,number][][]):CountryData['features'][number]=>({properties:{name:code,code},geometry:{type:'Polygon',coordinates:rings}});
describe('event-only country resolution',()=>{
  it('measures Istanbul coastline miss and resolves Turkey without changing the primary lookup',()=>{
    const turkey=index.byCode.get('TR')!;
    expect(turkey.polygons).toHaveLength(3);
    expect(turkey.polygons.every(p=>p.rings.length===1)).toBe(true);
    expect(getCountryAtLatLng(index,41.0082,28.9784)).toBeNull();
    const distance=distanceToCountryBoundaryKm(turkey,41.0082,28.9784);
    expect(distance).toBeGreaterThan(1.60);expect(distance).toBeLessThan(1.65);
    expect(resolveEventCountry(index,41.0082,28.9784)?.info.code).toBe('TR');
  });
  it.each([[40.4297,29.7231,'TR'],[50.4501,30.5234,'UA']] as const)('retains primary resolution at %s,%s', (lat,lon,code)=>{
    const primary=getCountryAtLatLng(index,lat,lon);expect(primary?.info.code).toBe(code);
    expect(resolveEventCountry(index,lat,lon)).toBe(primary);
  });
  it.each([[34,20],[0,-140],[NaN,0],[91,0]])('leaves offshore/far/invalid %s,%s unresolved',(lat,lon)=>{
    expect(resolveEventCountry(index,lat,lon)).toBeNull();
  });
  it('rejects ties and a narrow lead even when both countries are close',()=>{
    const nearby=fixture([feature('TR',[square(-.03,0)]),feature('GR',[square(.01,0)])]);
    expect(getNearestCountryAtLatLng(nearby,.01,0)).toBeNull();
    expect(getNearestCountryAtLatLng(nearby,.01,.001)).toBeNull();
  });
  it('primary polygon always wins even when nearest borders are ambiguous',()=>{
    const nearby=fixture([feature('TR',[square(0,0)]),feature('GR',[square(.021,0)])]);
    expect(getNearestCountryAtLatLng(nearby,.01,.019)).toBeNull();
    expect(resolveEventCountry(nearby,.01,.019)?.info.code).toBe('TR');
  });
  it('handles non-main MultiPolygon components and holes without mutation',()=>{
    const f:CountryData['features'][number]={properties:{name:'TR',code:'TR'},geometry:{type:'MultiPolygon',coordinates:[[square(10,10)],[square(0,0,.1),square(.04,.04,.02)]]}};
    const before=JSON.stringify(f);const multi=fixture([f]);
    expect(resolveEventCountry(multi,.05,-.01)?.info.code).toBe('TR');
    expect(getCountryAtLatLng(multi,.05,.05)).toBeNull();
    expect(distanceToCountryBoundaryKm(multi.byCode.get('TR')!,.05,.05)).toBeCloseTo(1.112,2);
    expect(JSON.stringify(f)).toBe(before);
  });
  it('measures endpoints, degenerate segments and antimeridian crossings',()=>{
    expect(distanceToBoundarySegmentKm([0,1],[-1,0],[1,0])).toBeCloseTo(111.195,2);
    expect(distanceToBoundarySegmentKm([0,1],[0,0],[0,0])).toBeCloseTo(111.195,2);
    expect(distanceToBoundarySegmentKm([180,1],[179,0],[-179,0])).toBeCloseTo(111.195,2);
    expect(distanceToBoundarySegmentKm([2,0],[0,0],[1,0])).toBeCloseTo(111.195,2);
  });
});
