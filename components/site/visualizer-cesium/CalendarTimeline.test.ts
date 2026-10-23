import {describe,expect,it} from 'vitest';
import {dateAt,dayIndex,daysInYear,nextEventDay} from './CalendarTimeline';

const day=(date:string)=>({date,count:1,titles:[],lat:0,lon:0});
describe('calendar timeline dates',()=>{
  it('maps civil dates to day positions and back, including leap years',()=>{
    expect(daysInYear(2026)).toBe(365);expect(daysInYear(2028)).toBe(366);
    expect(dayIndex('2026-01-01')).toBe(0);expect(dayIndex('2026-12-31')).toBe(364);expect(dayIndex('2028-12-31')).toBe(365);
    expect(dateAt(2026,dayIndex('2026-09-29'))).toBe('2026-09-29');
  });
  it('clamps positions to the year',()=>{
    expect(dateAt(2026,-5)).toBe('2026-01-01');expect(dateAt(2026,400)).toBe('2026-12-31');
  });
  it('steps to the next day with events and stops at the end of the year',()=>{
    const days=[day('2026-01-14'),day('2026-09-02'),day('2026-09-03')];
    expect(nextEventDay(days,'2026-01-01')).toBe('2026-01-14');
    expect(nextEventDay(days,'2026-09-02')).toBe('2026-09-03');
    expect(nextEventDay(days,'2026-09-03')).toBeNull();
  });
});
