import {afterEach,describe,it,expect,vi} from 'vitest';
import {calendarQuery,requireLocalCalendar,requirePublicCalendar} from './geo-api';
afterEach(()=>vi.unstubAllEnvs());
describe('calendarQuery input validation',()=>{
  it('accepts all three locales without changing date or policy',()=>{
    for(const locale of ['uk','ru','en'])expect(calendarQuery(new URLSearchParams({date:'2026-09-18',locale}))).toEqual({date:'2026-09-18',locale,calendarSystem:'julian',tradition:'orthodox'});
  });
  it('rejects invalid dates and unsupported policies',()=>{
    expect(()=>calendarQuery(new URLSearchParams({date:'2026-02-29'}))).toThrow();
    expect(()=>calendarQuery(new URLSearchParams({date:'2026-09-18',tradition:'catholic'}))).toThrow();
  });
});
describe('requireLocalCalendar (admin/dev-only policy)',()=>{
  it('never exposes local-only routes in production or on a remote host',()=>{
    vi.stubEnv('NODE_ENV','production');expect(()=>requireLocalCalendar(new Request('http://localhost/api/admin/calendar-geo'))).toThrow();
    vi.stubEnv('NODE_ENV','development');expect(()=>requireLocalCalendar(new Request('https://svetikony.com/api/admin/calendar-geo'))).toThrow();
    expect(requireLocalCalendar(new Request('http://localhost:3000/api/admin/calendar-geo')).hostname).toBe('localhost');
  });
});
describe('requirePublicCalendar (public production policy)',()=>{
  it('allows production traffic on the real production host',()=>{
    vi.stubEnv('NODE_ENV','production');
    expect(requirePublicCalendar(new Request('https://svetikony.com/api/calendar/geo?date=2026-09-18')).hostname).toBe('svetikony.com');
  });
  it('allows localhost during development',()=>{
    vi.stubEnv('NODE_ENV','development');
    expect(requirePublicCalendar(new Request('http://localhost:3000/api/calendar/geo')).hostname).toBe('localhost');
  });
  it('never throws, regardless of environment or host -- it only parses the URL',()=>{
    for(const env of ['production','development','test',undefined]){
      if(env)vi.stubEnv('NODE_ENV',env);
      expect(()=>requirePublicCalendar(new Request('https://svetikony.com/api/calendar/catalog'))).not.toThrow();
      expect(()=>requirePublicCalendar(new Request('http://127.0.0.1:3000/api/calendar/catalog'))).not.toThrow();
    }
  });
});
