import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({service:vi.fn(),session:vi.fn(),hash:vi.fn(),apply:vi.fn()}));
vi.mock('@/lib/d1/auth',()=>({requireSuperAdmin:mocks.service}));
vi.mock('@/lib/d1/repositories/admin-sessions',()=>({validateSession:mocks.session}));
vi.mock('@/lib/d1/session-token',()=>({hashSessionToken:mocks.hash}));
vi.mock('@/lib/d1/repositories/calendarGeoReview',()=>({applyCalendarReview:mocks.apply}));
import {GET,POST} from './route';
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','development');vi.clearAllMocks();
  mocks.service.mockResolvedValue({});mocks.hash.mockResolvedValue('hashed');
  mocks.session.mockResolvedValue({outcome:'valid',user:{id:'real-editor',role:'editor'}});
  mocks.apply.mockResolvedValue({ok:true});
});
afterEach(()=>vi.unstubAllEnvs());
function request(session=true){return new Request('http://localhost:3000/api/admin/calendar-geo',{method:'POST',headers:{'Content-Type':'application/json',...(session?{'X-Admin-Session':'fixture-token'}:{})},body:JSON.stringify({requestId:'r',profileId:'p',revision:'v',action:'geo_unknown',reviewer:'forged'})});}
it('requires a human session in addition to service authentication',async()=>{
  expect((await POST(request(false))).status).toBe(401);expect(mocks.apply).not.toHaveBeenCalled();
});
it('rejects invalid sessions and viewer mutations',async()=>{
  mocks.session.mockResolvedValueOnce({outcome:'expired'});
  expect((await POST(request())).status).toBe(401);
  mocks.session.mockResolvedValueOnce({outcome:'valid',user:{id:'viewer',role:'viewer'}});
  expect((await POST(request())).status).toBe(403);expect(mocks.apply).not.toHaveBeenCalled();
});
it('takes the reviewer identity only from the verified server session',async()=>{
  expect((await POST(request())).status).toBe(200);
  expect(mocks.hash).toHaveBeenCalledWith('fixture-token');
  expect(mocks.apply.mock.calls[0][1]).toBe('real-editor');
});
it('disables production mutations before authentication or database calls',async()=>{
  vi.stubEnv('NODE_ENV','production');expect((await POST(request())).status).toBe(404);
  expect(mocks.service).not.toHaveBeenCalled();expect(mocks.apply).not.toHaveBeenCalled();
});
it('disables production reads (GET) before authentication or database calls',async()=>{
  vi.stubEnv('NODE_ENV','production');
  const res=await GET(new Request('https://svetikony.com/api/admin/calendar-geo'));
  expect(res.status).toBe(404);
  expect(mocks.service).not.toHaveBeenCalled();
});
it('disables reads from a remote development host even when NODE_ENV stays development',async()=>{
  const res=await GET(new Request('https://svetikony.com/api/admin/calendar-geo'));
  expect(res.status).toBe(404);
  expect(mocks.service).not.toHaveBeenCalled();
});
