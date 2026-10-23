import {beforeEach,expect,it,vi} from 'vitest';
const {all,first}=vi.hoisted(()=>({all:vi.fn(),first:vi.fn()}));
vi.mock('@/lib/d1/db',()=>({d1All:all,d1First:first}));
import {calendarEntry,calendarGeoDay} from './calendarGeo';
beforeEach(()=>{all.mockReset();first.mockReset();});
it('keeps every occurrence in a zero-geo day and uses stable rule ids',async()=>{
  first.mockResolvedValueOnce({civil_date:'2026-09-18'}).mockResolvedValueOnce({commemorations:2});
  all.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {id:'r1',entityId:null,title:'Martyr A',sourceTitle:'Martyr A',summary:'',entityType:null},
    {id:'r2',entityId:null,title:'Icon B',sourceTitle:'Icon B',summary:'',entityType:null}]);
  const result=await calendarGeoDay({date:'2026-09-18',locale:'uk',calendarSystem:'julian',tradition:'orthodox'});
  expect(result.items).toEqual([]);expect(result.entries).toHaveLength(2);expect(result.commemorations).toBe(2);
  expect(result.entries.map(e=>[e.id,e.entityType,e.hasGeo])).toEqual([['r1','saint',false],['r2','icon',false]]);
  expect(all.mock.calls[1].slice(1)).toEqual(['uk','uk','2026-09-18','julian','orthodox']);
  expect(all.mock.calls[1][0]).toContain('LEFT JOIN calendar_geo_entities');
});
it('opens unmatched rule cards without external calls or fabricated content',async()=>{
  first.mockResolvedValueOnce({id:'r1',entityId:null,title:'Martyr A',url:'https://www.oca.org/saints/lives',type:'church_source'});
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('External access is forbidden'));
  try{const card=await calendarEntry('r1','ru');expect(card).toMatchObject({title:'Martyr A',places:[],summary:'',image:null,relatedContent:[]});expect(network).not.toHaveBeenCalled();expect(all).not.toHaveBeenCalled();}finally{network.mockRestore();}
});
it('rejects unknown rules instead of inventing a calendar card',async()=>{first.mockResolvedValue(null);await expect(calendarEntry('missing','en')).rejects.toMatchObject({status:404});});
it('groups a year into days with distinct mappable commemorations, calendar rules and site saints alike',async()=>{
  const {calendarGeoYear}=await import('./calendarGeo');
  all.mockResolvedValueOnce([
    {date:'2026-09-20',entityId:'a',title:'Feast',lat:31.78,lon:35.24,priority:90},
    {date:'2026-09-20',entityId:'a',title:'Feast',lat:31.78,lon:35.24,priority:90},
    {date:'2026-09-20',entityId:'b',title:'B',lat:58.5,lon:31.3,priority:70},
    {date:'2026-09-29',entityId:'internal:saint:e',title:'Euphemia',lat:40.99,lon:29.03,priority:70}]);
  const days=await calendarGeoYear({year:2026,locale:'uk',calendarSystem:'julian',tradition:'orthodox'});
  expect(days).toEqual([{date:'2026-09-20',count:2,titles:['Feast','B'],lat:31.78,lon:35.24},{date:'2026-09-29',count:1,titles:['Euphemia'],lat:40.99,lon:29.03}]);
  const [sql,...binds]=all.mock.calls[0];
  expect(sql).toContain('church_calendar_days');expect(sql).toContain('calendar_geo_occurrences');
  expect(binds).toEqual(['uk','uk','2026-01-01','2026-12-31','julian','orthodox','uk','uk','2026-01-01','2026-12-31']);
});
