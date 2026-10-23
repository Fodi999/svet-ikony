import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({year:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeo',()=>({calendarGeoYear:mocks.year}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.year.mockResolvedValue([]);vi.stubEnv('NODE_ENV','development');});
describe('GET /api/calendar/geo/year',()=>{
  it('returns the days of the requested year under the default calendar policy',async()=>{
    const res=await GET(new Request('http://localhost:3000/api/calendar/geo/year?year=2026&locale=ru'));
    expect(res.status).toBe(200);expect(await res.json()).toEqual({days:[]});
    expect(mocks.year).toHaveBeenCalledWith({year:2026,locale:'ru',calendarSystem:'julian',tradition:'orthodox'});
  });
  it('rejects a missing or out-of-range year',async()=>{
    for(const query of ['','year=abc','year=1800'])expect((await GET(new Request('http://localhost:3000/api/calendar/geo/year?'+query))).status).toBe(400);
    expect(mocks.year).not.toHaveBeenCalled();
  });
});
