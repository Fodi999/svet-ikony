import {describe,it,expect} from 'vitest';
import {selectIdentity, type IdentityCandidate, type IdentityProfile} from './geo-identity';
const profile:IdentityProfile={names:['Basil'],sourceUrls:[],calendarDates:['01-01']};
const candidate:IdentityCandidate={qid:'Q1',names:['Basil'],description:'bishop',roleIds:[],placeIds:[],referenceUrls:[],isHuman:true};
describe('conservative calendar identity matching',()=>{
  it('never promotes a name-only match',()=>expect(selectIdentity(profile,[candidate]).status).toBe('needs_review'));
  it('uses independent role, place and date evidence',()=>{
    const p={...profile,birthYear:330,roleIds:['Qbishop'],placeIds:['Qcity']};
    expect(selectIdentity(p,[{...candidate,birthYear:330,roleIds:['Qbishop'],placeIds:['Qcity']}]).status).toBe('machine_high');
  });
  it('preserves date conflicts despite a trusted identifier',()=>{
    expect(selectIdentity({...profile,trustedQid:'Q1',birthYear:330},[{...candidate,birthYear:400}]).status).toBe('needs_review');
  });
  it('does not turn a group into a single saint',()=>{
    expect(selectIdentity({...profile,group:true,trustedQid:'Q1'},[candidate]).qid).toBeNull();
  });
  it('keeps multiple high candidates for review',()=>{
    const p={...profile,sourceUrls:['https://source.example/one']};
    expect(selectIdentity(p,[{...candidate,referenceUrls:p.sourceUrls},{...candidate,qid:'Q2',referenceUrls:p.sourceUrls}]).status).toBe('needs_review');
  });
  it('distinguishes no search results',()=>expect(selectIdentity(profile,[]).status).toBe('not_found'));
  it('assigns machine status, never reviewed_verified',()=>{
    expect(selectIdentity({...profile,trustedQid:'Q1'},[candidate]).status).toBe('machine_high');
  });
  it('accepts an exact OCA identity citation, not a day page or hostile hostname',()=>{
    const p={...profile,ocaId:'100003'};
    expect(selectIdentity(p,[{...candidate,referenceUrls:['https://www.oca.org/saints/lives/2024/01/01/100003-saint-basil']}]).status).toBe('machine_high');
    for(const url of ['https://evil.example/saints/lives/2024/01/01/100003-saint-basil','https://www.oca.org/saints/lives/2024/01/01','https://www.oca.org/saints/lives/2024/01/01/100004-other']) {
      expect(selectIdentity(p,[{...candidate,referenceUrls:[url]}]).status).toBe('needs_review');
    }
  });
});
