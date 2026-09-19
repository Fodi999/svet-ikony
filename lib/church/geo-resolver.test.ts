import {describe, expect, it} from 'vitest';
import {civilDays, orthodoxPascha, parseCivilDate, resolveCalendarDay, type CalendarRule} from './geo-resolver';

const policy = {calendarSystem: 'julian' as const, tradition: 'orthodox'};
const fixed: CalendarRule = {...policy, jurisdiction: '', id: 'nativity', type: 'fixed', month: 12, day: 25};
describe('calendar geography resolver', () => {
  it('resolves every civil date without duplicates, including leap day', () => {
    expect(civilDays(2026)).toHaveLength(365);
    expect(new Set(civilDays(2026)).size).toBe(365);
    expect(civilDays(2028)).toHaveLength(366);
    expect(civilDays(2028)).toContain('2028-02-29');
  });
  it('rejects invalid dates and unsupported years', () => {
    for (const date of ['2026-02-29','2026-04-31','2026-1-1','garbage']) expect(() => parseCivilDate(date)).toThrow();
    expect(() => civilDays(0)).toThrow();
  });
  it('matches fixed dates across year boundaries without a hardcoded 13 days', () => {
    expect(resolveCalendarDay('2026-01-07', [fixed], policy)).toEqual(['nativity']);
    expect(resolveCalendarDay('2026-12-25', [fixed], policy)).toEqual([]);
    expect(resolveCalendarDay('2101-01-08', [fixed], policy)).toEqual(['nativity']);
  });
  it('matches Gregorian fixed rules separately', () => {
    const calendarSystem = 'gregorian' as const;
    expect(resolveCalendarDay('2026-12-25', [{...fixed,calendarSystem}], {...policy,calendarSystem})).toEqual(['nativity']);
  });
  it('agrees with the OCA paschal cycle reference years', () => {
    expect(orthodoxPascha(2026)).toBe('2026-04-12');
    expect(orthodoxPascha(2028)).toBe('2028-04-16');
  });
  it('resolves movable offsets and keeps traditions separate', () => {
    const rule: CalendarRule = {...policy,jurisdiction:'',id:'ascension',type:'movable',anchor:'orthodox_pascha',offsetDays:39};
    expect(resolveCalendarDay('2026-05-21',[rule,rule],policy)).toEqual(['ascension']);
    expect(resolveCalendarDay('2026-05-21',[rule],{...policy,tradition:'catholic'})).toEqual([]);
  });
  it('matches Julian leap day on its civil date', () => {
    const rule: CalendarRule = {...fixed,id:'leap',type:'fixed',month:2,day:29};
    expect(resolveCalendarDay('2028-03-13',[rule],policy)).toEqual(['leap']);
    expect(civilDays(2026).flatMap(date=>resolveCalendarDay(date,[rule],policy))).toEqual([]);
  });
});
