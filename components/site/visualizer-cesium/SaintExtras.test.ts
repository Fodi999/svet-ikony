import {describe,expect,it} from 'vitest';
import {nextCommemoration} from './SaintExtras';
describe('nextCommemoration',()=>{
 it('picks the first commemoration on or after today',()=>{expect(nextCommemoration(['2026-12-17','2026-01-05','2027-12-17'],'2026-09-27')).toBe('2026-12-17');});
 it('falls back to the latest past date and ignores junk',()=>{expect(nextCommemoration(['2025-12-17','bad'],'2026-09-27')).toBe('2025-12-17');});
 it('returns null without dates',()=>{expect(nextCommemoration([],'2026-09-27')).toBeNull();});
});
