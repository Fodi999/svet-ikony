import {describe,expect,it,vi} from 'vitest';
import {fetchRoute,parseLatLon,parseMode} from './osrm';

const reply=(body:unknown,status=200)=>vi.fn(async(...args:[string])=>args&&new Response(JSON.stringify(body),{status}));
describe('OSRM routing',()=>{
  it('requests lon,lat pairs from the mode endpoint and returns distance, duration and line',async()=>{
    const fetcher=reply({code:'Ok',routes:[{distance:5299.4,duration:524.2,geometry:{coordinates:[[30.52,50.45],[30.56,50.43]]}}]});
    const route=await fetchRoute({lat:50.45,lon:30.52},{lat:50.43,lon:30.56},'foot',fetcher as unknown as typeof fetch);
    expect(route).toEqual({mode:'foot',distance:5299,duration:524,coordinates:[[30.52,50.45],[30.56,50.43]]});
    expect(String(fetcher.mock.calls[0][0])).toMatch(/routed-foot\/route\/v1\/driving\/30\.52,50\.45;30\.56,50\.43\?overview=full&geometries=geojson/);
  });
  it('reports an unreachable destination as no route rather than an error',async()=>{
    expect(await fetchRoute({lat:0,lon:0},{lat:1,lon:1},'car',reply({code:'NoRoute'},400) as unknown as typeof fetch)).toBeNull();
  });
  it('fails clearly when the service is down',async()=>{
    await expect(fetchRoute({lat:0,lon:0},{lat:1,lon:1},'car',reply({message:'busy'},503) as unknown as typeof fetch)).rejects.toMatchObject({status:502});
  });
  it('validates coordinates and travel mode',()=>{
    expect(parseLatLon('31.78,35.23','to')).toEqual({lat:31.78,lon:35.23});
    for(const bad of [null,'','91,0','10','a,b'])expect(()=>parseLatLon(bad,'to')).toThrow();
    expect(parseMode(null)).toBe('car');expect(parseMode('foot')).toBe('foot');expect(()=>parseMode('plane')).toThrow();
  });
});
