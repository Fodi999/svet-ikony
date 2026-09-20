import {ApiError} from '@/lib/d1/errors';
import {parseCivilDate} from './geo-resolver';
export function requireLocalCalendar(request:Request) {
  const url=new URL(request.url);
  if(process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw ApiError.notFound('Local calendar only');
  return url;
}
/** Public, read-only calendar endpoints (geo/catalog/entry/entity) are meant to
 * serve production traffic on any host -- unlike requireLocalCalendar(), which
 * stays local/dev-only for the admin review workflow. This is a URL parse, not
 * a security gate: the actual access control for those public GET routes is
 * the read-only, credible-data-only SQL in lib/d1/repositories/calendarGeo.ts. */
export function requirePublicCalendar(request:Request) {
  return new URL(request.url);
}
export function calendarQuery(params:URLSearchParams) {
  const date=params.get('date')??'';
  try{parseCivilDate(date);}catch{throw ApiError.validation('date must be a valid YYYY-MM-DD');}
  const locale=params.get('locale')??'uk';
  const calendarSystem=params.get('calendarSystem')??'julian';
  const tradition=params.get('tradition')??'orthodox';
  if(!['uk','ru','en'].includes(locale)||!['julian','gregorian'].includes(calendarSystem)||tradition!=='orthodox')throw ApiError.validation('Unsupported calendar policy or locale');
  return {date,locale,calendarSystem,tradition};
}
