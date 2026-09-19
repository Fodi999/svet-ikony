import {describe,it,expect} from 'vitest';
import {entryCategory} from './calendar-entry';
describe('calendar presentation categories',()=>{
  it('respects existing identity types',()=>{expect(entryCategory('feast','Unknown')).toBe('feast');expect(entryCategory('historical_event','Saint Peter')).toBe('event');});
  it('keeps unidentified commemorations visible',()=>{expect(entryCategory(null,'Unknown commemoration')).toBe('event');});
  it('recognizes explicit source categories without creating identities',()=>{expect(entryCategory(null,'Martyr Athanasius')).toBe('saint');expect(entryCategory(null,'Icon of the Mother of God')).toBe('icon');expect(entryCategory(null,'Nativity of Christ')).toBe('feast');});
});
