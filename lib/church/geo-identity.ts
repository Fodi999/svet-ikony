export interface IdentityProfile {
  names: string[];
  biography?: string;
  roleIds?: string[];
  placeIds?: string[];
  birthYear?: number;
  deathYear?: number;
  trustedQid?: string;
  sourceUrls: string[];
  calendarDates: string[];
  translationGroup?: string;
  group?: boolean;
  ocaId?: string;
}
export interface IdentityCandidate {
  qid: string;
  names: string[];
  description: string;
  roleIds: string[];
  placeIds: string[];
  birthYear?: number;
  deathYear?: number;
  referenceUrls: string[];
  isHuman: boolean;
}
export function normalizeIdentityName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
}

export function ocaIdentityId(value: string): string | null {
  try {
    const url=new URL(value);
    if (!['www.oca.org','oca.org','ocafs.oca.org'].includes(url.hostname)) return null;
    const id=url.searchParams.get('FSID')??url.pathname.match(/\/saints\/lives\/\d{4}\/\d{2}\/\d{2}\/(\d+)(?:-|$)/)?.[1];
    return id && /^\d+$/.test(id)?id:null;
  } catch { return null; }
}

/** Name equality alone is never sufficient for automatic identity assignment. */
export function assessIdentity(profile: IdentityProfile, candidate: IdentityCandidate) {
  const name = profile.names.some(n=>candidate.names.some(c=>normalizeIdentityName(n)===normalizeIdentityName(c)));
  const roles = (profile.roleIds??[]).some(id=>candidate.roleIds.includes(id));
  const places = (profile.placeIds??[]).some(id=>candidate.placeIds.includes(id));
  const birth = profile.birthYear!==undefined && candidate.birthYear!==undefined;
  const death = profile.deathYear!==undefined && candidate.deathYear!==undefined;
  const conflict = (birth && profile.birthYear!==candidate.birthYear) || (death && profile.deathYear!==candidate.deathYear) ||
    (profile.group===true && candidate.isHuman) || (profile.trustedQid!==undefined && profile.trustedQid!==candidate.qid);
  const dates = (birth && profile.birthYear===candidate.birthYear) || (death && profile.deathYear===candidate.deathYear);
  const explicit = profile.trustedQid===candidate.qid || profile.sourceUrls.some(url=>candidate.referenceUrls.includes(url)) ||
    (profile.ocaId!==undefined && candidate.referenceUrls.some(url=>ocaIdentityId(url)===profile.ocaId));
  const confidence = !conflict && (explicit || (name && roles && places && dates)) ? 'HIGH' : name && !conflict ? 'MEDIUM' : 'LOW';
  return {confidence, evidence:{name,roles,places,dates,explicit,conflict}} as const;
}

export function selectIdentity(profile: IdentityProfile, candidates: IdentityCandidate[]) {
  const assessed=candidates.map(candidate=>({qid:candidate.qid,...assessIdentity(profile,candidate)}));
  const high=assessed.filter(candidate=>candidate.confidence==='HIGH');
  return {status:assessed.length===0?'not_found':high.length===1?'machine_high':'needs_review',
    qid:high.length===1?high[0].qid:null,candidates:assessed};
}
