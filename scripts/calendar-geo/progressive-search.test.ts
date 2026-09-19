import {expect,it} from 'vitest';
import {progressiveSearch} from './progressive-search.mjs';
it('continues after unrelated candidates, deduplicates QIDs, and stops at unique HIGH',async()=>{
  const variants=['full','alias','known','unused'].map(search=>({search}));
  const fetched:string[][]=[];
  const result=await progressiveSearch(variants,async({search}:{search:string})=>search==='full'?['Q1']:search==='alias'?['Q1','Q2']:['Q3'],async(ids:string[])=>{
    fetched.push(ids);return {status:ids.includes('Q3')?'machine_high':'needs_review'};
  });
  expect(fetched).toEqual([[],['Q1'],['Q2'],['Q3']]);
  expect(result.searches.map((s:{search:string})=>s.search)).toEqual(['full','alias','known']);
});
