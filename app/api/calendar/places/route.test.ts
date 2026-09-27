import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeoPlaces',()=>({listSacredPlaces:mocks.list}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.list.mockResolvedValue([]);});
describe('GET /api/calendar/places',()=>{
  it('parses bbox/zoom/locale and forwards them to the repository',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/places?bbox=30,50,31,51&zoom=8&locale=ru'));
    expect(res.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({west:30,south:50,east:31,north:51},8,'ru');
  });
  it('defaults zoom to null when absent', async()=>{
    await GET(new Request('https://svetikony.com/api/calendar/places?bbox=30,50,31,51'));
    expect(mocks.list).toHaveBeenCalledWith({west:30,south:50,east:31,north:51},null,'uk');
  });
  it('rejects a malformed bbox without querying the database',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/places?bbox=30,50,31'));
    expect(res.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('rejects an inverted bbox (west >= east)',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/places?bbox=31,50,30,51'));
    expect(res.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('rejects out-of-range coordinates',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/places?bbox=30,50,31,200'));
    expect(res.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
