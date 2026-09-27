import {afterEach,expect,it,vi} from 'vitest';
import {GET} from './route';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('is disabled outside development without network access',async()=>{
  vi.stubEnv('NODE_ENV','production');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect((await GET(new Request('http://localhost/api/dev/published-history'))).status).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});
it('reads only the fixed public endpoint',async()=>{
  vi.stubEnv('NODE_ENV','development');const fetcher=vi.fn().mockResolvedValue(Response.json([{id:'one',title:'History',status:'published'}]));vi.stubGlobal('fetch',fetcher);
  const response=await GET(new Request('http://localhost/api/dev/published-history?language=ru'));
  expect(response.status).toBe(200);expect(response.headers.get('X-History-Source')).toBe('production-public-read-only');
  expect(fetcher).toHaveBeenCalledWith('https://svetikony.com/api/church/visualizer-events?language=ru',expect.objectContaining({redirect:'error',cache:'no-store'}));
});
it('rejects invalid languages and unpublished responses',async()=>{
  vi.stubEnv('NODE_ENV','development');const fetcher=vi.fn().mockResolvedValue(Response.json([{id:'one',title:'History',status:'draft'}]));vi.stubGlobal('fetch',fetcher);
  expect((await GET(new Request('http://localhost/api/dev/published-history?language=xx'))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await GET(new Request('http://localhost/api/dev/published-history'))).status).toBe(502);
});
