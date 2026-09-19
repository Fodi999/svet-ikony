import {beforeEach,expect,it,vi} from 'vitest';
const {all,first,run}=vi.hoisted(()=>({all:vi.fn(),first:vi.fn(),run:vi.fn()}));
vi.mock('@/lib/d1/db',()=>({d1All:all,d1First:first,d1Run:run}));
import {calendarReviewProfile,calendarReviewQueue,reviewFilters,previewCalendarCandidate} from './calendarGeoReview';
beforeEach(()=>{all.mockReset().mockResolvedValue([]);first.mockReset().mockResolvedValue({total:0});run.mockReset().mockResolvedValue({});});
it('rejects unlisted filters and noninteger pagination before SQL',async()=>{
  await expect(calendarReviewQueue(new URLSearchParams('filter=1%3D1'))).rejects.toMatchObject({status:400});
  await expect(calendarReviewQueue(new URLSearchParams('offset=NaN'))).rejects.toMatchObject({status:400});expect(all).not.toHaveBeenCalled();
});
it('binds pagination and excludes fallback from native language coverage',async()=>{
  await calendarReviewQueue(new URLSearchParams('filter=missing_uk&offset=30'));
  expect(all.mock.calls[0][1]).toBe(30);expect(all.mock.calls[0][0]).toContain("translation_status IN ('source','verified')");
});
it('uses the actual boolean conflict evidence',()=>{expect(reviewFilters.conflict).toContain("json_extract(c.evidence_json,'$.conflict')=1");});
it('returns not found for unknown identity',async()=>{first.mockResolvedValue(null);await expect(calendarReviewProfile('missing')).rejects.toMatchObject({status:404});});
it('reuses imported QID data for manual preview without another Wikimedia request',async()=>{
  const entity={id:'Q42',labels:{en:{value:'Test'}},claims:{}};
  first.mockResolvedValueOnce({id:'p'}).mockResolvedValueOnce(null).mockResolvedValueOnce({entity_json:JSON.stringify(entity)});
  const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Unexpected request'));
  try{expect(await previewCalendarCandidate('p','Q42')).toEqual({qid:'Q42',entity});expect(fetch).not.toHaveBeenCalled();
    expect(run.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
  }finally{fetch.mockRestore();}
});
