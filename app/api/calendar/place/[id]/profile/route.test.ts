import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({profile:vi.fn()}));
vi.mock('@/lib/d1/repositories/calendarGeoPlaces',()=>({getPlaceProfile:mocks.profile}));
import {GET} from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.profile.mockResolvedValue({id:'place-1',hasProfile:true,history:'',address:'',directions:'',openingHours:{},websiteUrl:null,mapUrl:null,territory:null});});
function ctx(id:string){return {params:Promise.resolve({id})};}
describe('GET /api/calendar/place/[id]/profile',()=>{
  it('returns the profile for a known place',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/place/place-1/profile?locale=ru'),ctx('place-1'));
    expect(res.status).toBe(200);
    expect(mocks.profile).toHaveBeenCalledWith('place-1','ru');
  });
  it('defaults to uk locale',async()=>{
    await GET(new Request('https://svetikony.com/api/calendar/place/place-1/profile'),ctx('place-1'));
    expect(mocks.profile).toHaveBeenCalledWith('place-1','uk');
  });
  it('rejects an unsupported locale without querying the database',async()=>{
    const res=await GET(new Request('https://svetikony.com/api/calendar/place/place-1/profile?locale=fr'),ctx('place-1'));
    expect(res.status).toBe(400);
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
