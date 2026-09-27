import {ApiError} from '@/lib/d1/errors';
import {getDb} from '@/lib/d1/env';

const types = ['city', 'village', 'church', 'monastery', 'shrine', 'pilgrimage_place', 'other'];
export function parseMarkerPlace(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw ApiError.validation('Place required');
  const value = raw as Record<string, unknown>;
  function text(key: string, max: number, required = false) {
    const input = value[key];
    if (input !== undefined && typeof input !== 'string') throw ApiError.validation(`Invalid ${key}`);
    const result = ((input ?? '') as string).trim();
    if (result.length > max || (required && !result)) throw ApiError.validation(`Invalid ${key}`);
    return result;
  }
  const title = text('title', 200, true), type = text('type', 30, true), locale = text('locale', 2, true);
  const requestId = text('requestId', 36, true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw ApiError.validation('Invalid request ID');
  if (!types.includes(type) || !['uk', 'ru', 'en'].includes(locale)) throw ApiError.validation('Invalid type or language');
  const {lat, lon} = value;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw ApiError.validation('Invalid coordinates');
  const source = text('source', 2000, true);
  try { if (!['https:', 'http:'].includes(new URL(source).protocol)) throw new Error(); }
  catch { throw ApiError.validation('Source must be an HTTP(S) URL'); }
  return {requestId, title, type, locale, lat, lon, source, history: text('history', 20000, true), address: text('address', 500)};
}

export async function createMarkerPlace(raw: unknown) {
  const p = parseMarkerPlace(raw), db = await getDb();
  // A stable per-form request ID makes a retry return the same place, not another pin.
  const id = `manual:${p.requestId}`;
  if (await db.prepare('SELECT id FROM calendar_geo_places WHERE id=?').bind(id).first()) return {placeId: id};
  const sourceId = `source:${p.requestId}`;
  await db.batch([
    db.prepare("INSERT INTO calendar_geo_places(id,canonical_name,lat,lon,place_type,verification_status) VALUES(?,?,?,?,?,'needs_review')").bind(id,p.title,p.lat,p.lon,p.type),
    db.prepare("INSERT INTO calendar_geo_sources(id,source_type,source_url,retrieved_at) VALUES(?,'manual',?,?)").bind(sourceId,p.source,new Date().toISOString()),
    db.prepare("INSERT INTO calendar_geo_translations(id,place_id,locale,name,translation_status,source_locale,source_id) VALUES(?,?,?,?,'source',?,?)").bind(`translation:${p.requestId}`,id,p.locale,p.title,p.locale,sourceId),
    db.prepare('INSERT INTO calendar_geo_place_profiles(place_id) VALUES(?)').bind(id),
    db.prepare('INSERT INTO calendar_geo_place_profile_translations(place_id,locale,history_text,address) VALUES(?,?,?,?)').bind(id,p.locale,p.history,p.address),
    db.prepare("INSERT INTO calendar_geo_provenance(id,place_id,field_name,source_id,value_json) VALUES(?,?,'coordinates',?,?)").bind(`provenance:${p.requestId}`,id,sourceId,JSON.stringify({lat:p.lat,lon:p.lon}))
  ]);
  return {placeId: id};
}
