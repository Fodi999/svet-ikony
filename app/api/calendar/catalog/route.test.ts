import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({catalog:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeo',()=>({calendarGeoCatalog:mocks.catalog}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.catalog.mockResolvedValue({items:[],entries:[]});});
afterEach(()=>vi.unstubAllEnvs());
function request(url:string){return new Request(url);}
describe('GET /api/calendar/catalog (public, read-only)',()=>{
  it('is reachable on the real production host in production',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(request('https://svetikony.com/api/calendar/catalog?locale=uk'));
    expect(res.status).toBe(200);
    expect(mocks.catalog).toHaveBeenCalledWith('uk');
  });
  it('is reachable on localhost in development',async()=>{
    vi.stubEnv('NODE_ENV','development');
    const res=await GET(request('http://localhost:3000/api/calendar/catalog'));
    expect(res.status).toBe(200);
  });
  it('rejects an unsupported locale',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(request('https://svetikony.com/api/calendar/catalog?locale=fr'));
    expect(res.status).toBe(400);
    expect(mocks.catalog).not.toHaveBeenCalled();
  });
});
