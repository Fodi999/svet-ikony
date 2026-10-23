import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({route:vi.fn()}));
vi.mock('@/lib/routes/osrm',async original=>({...await original<typeof import('@/lib/routes/osrm')>(),fetchRoute:mocks.route}));
import {GET} from './route';
beforeEach(()=>{mocks.route.mockReset();});
it('returns the route with attribution and never caches the visitor position',async()=>{
  mocks.route.mockResolvedValue({mode:'car',distance:1,duration:2,coordinates:[]});
  const res=await GET(new Request('http://localhost/api/routes?from=50.45,30.52&to=31.78,35.23&mode=car'));
  expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toContain('no-store');
  expect(await res.json()).toMatchObject({route:{distance:1},attribution:expect.stringContaining('OpenStreetMap')});
  expect(mocks.route).toHaveBeenCalledWith({lat:50.45,lon:30.52},{lat:31.78,lon:35.23},'car');
});
it('rejects malformed input before calling the provider',async()=>{
  expect((await GET(new Request('http://localhost/api/routes?from=x&to=31,35'))).status).toBe(400);
  expect(mocks.route).not.toHaveBeenCalled();
});
