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
