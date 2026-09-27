import {describe,it,expect,vi} from 'vitest';
vi.mock('../env',()=>({getDb:vi.fn(),getMediaBucket:vi.fn()}));
import {validateDraft,type ImageDraft} from './markerImages';
const draft=():ImageDraft=>({originalKey:'media/saints/g/main/a.png',markerKey:'media/saints/g/main/b.png',panelKey:'media/saints/g/main/c.png',originalWidth:1000,originalHeight:1200,crop:{x:0,y:0,width:1,height:.8},identityVerified:false,rightsVerified:false,source:'',author:'',rights:''});
describe('marker draft validation',()=>{
 it('accepts an unverified draft without publishing it',()=>expect(()=>validateDraft(draft())).not.toThrow());
 it('rejects signed URLs',()=>expect(()=>validateDraft({...draft(),originalKey:'https://host/image?token=x'})).toThrow());
 it('rejects crop outside the original',()=>expect(()=>validateDraft({...draft(),crop:{x:.5,y:0,width:1,height:1}})).toThrow());
 it('requires separate explicit rights evidence',()=>expect(()=>validateDraft({...draft(),rightsVerified:true})).toThrow());
 it('rejects missing draft',()=>expect(()=>validateDraft(undefined as unknown as ImageDraft)).toThrow());
 it('rejects variant key reuse across roles',()=>expect(()=>validateDraft({...draft(),panelKey:draft().markerKey})).toThrow());
});
