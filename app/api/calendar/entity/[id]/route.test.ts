import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({entity:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeo',()=>({calendarGeoEntity:mocks.entity}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.entity.mockResolvedValue({id:'e1',entityType:'saint',title:'t',summary:'',wikipedia:null,matchStatus:'reviewed_verified',places:[],commemorations:[],sources:[],image:null,biography:'',relatedContent:[]});});
afterEach(()=>vi.unstubAllEnvs());
function ctx(id:string){return {params:Promise.resolve({id})};}
describe('GET /api/calendar/entity/[id] (public, read-only)',()=>{
  it('is reachable on the real production host in production',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(new Request('https://svetikony.com/api/calendar/entity/e1?locale=uk'),ctx('e1'));
    expect(res.status).toBe(200);
    expect(mocks.entity).toHaveBeenCalledWith('e1','uk');
  });
  it('is reachable on localhost in development',async()=>{
    vi.stubEnv('NODE_ENV','development');
    const res=await GET(new Request('http://localhost:3000/api/calendar/entity/e1'),ctx('e1'));
    expect(res.status).toBe(200);
  });
  it('rejects an unsupported locale without querying the database',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(new Request('https://svetikony.com/api/calendar/entity/e1?locale=fr'),ctx('e1'));
    expect(res.status).toBe(400);
    expect(mocks.entity).not.toHaveBeenCalled();
  });
});
