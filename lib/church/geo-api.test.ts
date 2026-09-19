import {afterEach,describe,it,expect,vi} from 'vitest';
import {calendarQuery,requireLocalCalendar} from './geo-api';
afterEach(()=>vi.unstubAllEnvs());
describe('local calendar API policy',()=>{
  it('accepts all three locales without changing date or policy',()=>{
    for(const locale of ['uk','ru','en'])expect(calendarQuery(new URLSearchParams({date:'2026-09-18',locale}))).toEqual({date:'2026-09-18',locale,calendarSystem:'julian',tradition:'orthodox'});
  });
  it('rejects invalid dates and unsupported policies',()=>{
    expect(()=>calendarQuery(new URLSearchParams({date:'2026-02-29'}))).toThrow();
    expect(()=>calendarQuery(new URLSearchParams({date:'2026-09-18',tradition:'catholic'}))).toThrow();
  });
  it('never exposes these routes in production or on a remote host',()=>{
    vi.stubEnv('NODE_ENV','production');expect(()=>requireLocalCalendar(new Request('http://localhost/api/calendar/geo'))).toThrow();
    vi.stubEnv('NODE_ENV','development');expect(()=>requireLocalCalendar(new Request('https://svetikony.com/api/calendar/geo'))).toThrow();
    expect(requireLocalCalendar(new Request('http://localhost:3000/api/calendar/geo')).hostname).toBe('localhost');
  });
});
