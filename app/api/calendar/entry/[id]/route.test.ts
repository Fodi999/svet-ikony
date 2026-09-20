import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({entry:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeo',()=>({calendarEntry:mocks.entry}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.entry.mockResolvedValue({id:'r1',title:'t',summary:'',entityType:'other',matchStatus:'unmatched',wikipedia:null,places:[],image:null,relatedContent:[],sources:[]});});
afterEach(()=>vi.unstubAllEnvs());
function ctx(id:string){return {params:Promise.resolve({id})};}
describe('GET /api/calendar/entry/[id] (public, read-only)',()=>{
  it('is reachable on the real production host in production',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(new Request('https://svetikony.com/api/calendar/entry/r1?locale=uk'),ctx('r1'));
    expect(res.status).toBe(200);
    expect(mocks.entry).toHaveBeenCalledWith('r1','uk');
  });
  it('is reachable on localhost in development',async()=>{
    vi.stubEnv('NODE_ENV','development');
    const res=await GET(new Request('http://localhost:3000/api/calendar/entry/r1'),ctx('r1'));
    expect(res.status).toBe(200);
  });
  it('rejects an overlong id without querying the database',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(new Request('https://svetikony.com/api/calendar/entry/x'),ctx('x'.repeat(161)));
    expect(res.status).toBe(400);
    expect(mocks.entry).not.toHaveBeenCalled();
  });
});
