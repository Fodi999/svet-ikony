import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({collection:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeoPlaces',()=>({getPlaceCollection:mocks.collection}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.collection.mockResolvedValue({placeId:'place-1',items:[]});});
function ctx(id:string){return {params:Promise.resolve({id})};}
describe('GET /api/calendar/place/[id]/collection',()=>{
  it('returns the collection for a known place',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/place/place-1/collection?locale=en'),ctx('place-1'));
    expect(res.status).toBe(200);
    expect(mocks.collection).toHaveBeenCalledWith('place-1','en');
  });
  it('rejects an unsupported locale without querying the database',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/place/place-1/collection?locale=de'),ctx('place-1'));
    expect(res.status).toBe(400);
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});
