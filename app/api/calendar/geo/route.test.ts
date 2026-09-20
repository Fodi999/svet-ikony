import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({day:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeo',()=>({calendarGeoDay:mocks.day}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.day.mockResolvedValue({date:'2026-09-18',entries:[],items:[]});});
afterEach(()=>vi.unstubAllEnvs());
function request(url:string){return new Request(url);}
describe('GET /api/calendar/geo (public, read-only)',()=>{
  it('is reachable on the real production host in production',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(request('https://svetikony.com/api/calendar/geo?date=2026-09-18&locale=uk'));
    expect(res.status).toBe(200);
    expect(mocks.day).toHaveBeenCalledWith({date:'2026-09-18',locale:'uk',calendarSystem:'julian',tradition:'orthodox'});
  });
  it('is reachable on localhost in development',async()=>{
    vi.stubEnv('NODE_ENV','development');
    const res=await GET(request('http://localhost:3000/api/calendar/geo?date=2026-09-18'));
    expect(res.status).toBe(200);
  });
  it('still validates the calendar policy query',async()=>{
    vi.stubEnv('NODE_ENV','production');
    const res=await GET(request('https://svetikony.com/api/calendar/geo?date=not-a-date'));
    expect(res.status).toBe(400);
    expect(mocks.day).not.toHaveBeenCalled();
  });
});
