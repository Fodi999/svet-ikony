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

/** GET /api/calendar/places?bbox=west,south,east,north&zoom=N -- viewport
 * query for the Sacred Place marker layer. zoom is optional (null means
 * "no decimation"); everything else is required and range-checked so a
 * malformed bbox fails fast instead of silently returning the whole table. */
export function placesBboxQuery(params:URLSearchParams) {
  const raw=(params.get('bbox')??'').split(',').map(Number);
  if(raw.length!==4||raw.some(value=>!Number.isFinite(value)))throw ApiError.validation('bbox must be "west,south,east,north"');
  const [west,south,east,north]=raw;
  if(west<-180||east>180||south<-90||north>90||west>=east||south>=north)throw ApiError.validation('bbox out of range');
  const locale=params.get('locale')??'uk';
  if(!['uk','ru','en'].includes(locale))throw ApiError.validation('Invalid locale');
  const zoomParam=params.get('zoom');
  const zoom=zoomParam===null?null:Number(zoomParam);
  if(zoom!==null&&!Number.isFinite(zoom))throw ApiError.validation('zoom must be numeric');
  return {bbox:{west,south,east,north},zoom,locale:locale as 'uk'|'ru'|'en'};
}
