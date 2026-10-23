import {ApiError} from '@/lib/d1/errors';
import {getDb} from '@/lib/d1/env';

/**
 * Admin editing of real places (calendar_geo_places) and their Cesium 3D
 * model settings (calendar_geo_place_models, migration 0037), plus the
 * saint <-> place links.
 *
 * No second architecture: a place is calendar_geo_places (+ translations,
 * + calendar_geo_place_profiles for the public "sacred place" globe layer);
 * a saint is church_saints linked through calendar_geo_content_links to a
 * calendar_geo_entities row (id convention `internal:saint:<groupId>`,
 * scripts/calendar-geo/enrich-local.mjs); one saint reaches any number of
 * places through the existing many-to-many calendar_geo_relations table.
 */
export const PLACE_TYPES = ['church', 'monastery', 'shrine', 'pilgrimage_place', 'city', 'village', 'birthplace', 'martyrdom_place', 'burial_place', 'relic_location', 'historical_region', 'other'] as const;
export const RELATION_TYPES = ['birth', 'ministry', 'residence', 'martyrdom', 'death', 'burial', 'relics', 'founded', 'council', 'icon_origin', 'veneration', 'pilgrimage', 'other'] as const;
const LOCALES = ['uk', 'ru', 'en'] as const;
type Locale = typeof LOCALES[number];
export const ADMIN_SOURCE_ID = 'source:admin-manual';

export type GeoPlaceModel = {modelUrl: string; scale: number; heading: number; pitch: number; roll: number; heightOffset: number; status: 'draft' | 'published'};
export type GeoPlaceInput = {
  names: Record<Locale, string>; type: string; countryCode: string | null; region: string | null; city: string | null; district: string | null;
  address: Record<Locale, string>; lat: number; lon: number; altitude: number | null; verified: boolean; showOnGlobe: boolean;
  source: string | null; model: GeoPlaceModel | null;
};
export type GeoPlaceRecord = Omit<GeoPlaceInput, 'source' | 'lat' | 'lon'> & {lat: number | null; lon: number | null; id: string; canonicalName: string; hasProfile: boolean; saints: {entityId: string; title: string; relationType: string}[]};
export type GeoPlaceSummary = {id: string; title: string; type: string; countryCode: string | null; city: string | null; region: string | null; lat: number | null; lon: number | null; hasModel: boolean};

/** R2 media key (media/...glb) or a site path (/markers/...glb); never a
 * foreign origin -- the site serves every model from itself. */
export function isModelUrl(value: string) {
  return /^(media\/|\/markers\/)[A-Za-z0-9/_.-]+\.glb$/.test(value) && !value.includes('..') && !value.includes('//');
}

function record(raw: unknown, what: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw ApiError.validation(`${what} required`);
  return raw as Record<string, unknown>;
}
function text(value: Record<string, unknown>, key: string, max: number): string | null {
  const input = value[key];
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') throw ApiError.validation(`Invalid ${key}`);
  const trimmed = input.trim();
  if (trimmed.length > max) throw ApiError.validation(`${key} is too long`);
  return trimmed || null;
}
function number(value: unknown, key: string, min: number, max: number, fallback?: number): number {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw ApiError.validation(`Invalid ${key}`);
  return value;
}
function localized(raw: unknown, key: string, max: number): Record<Locale, string> {
  const value = raw === undefined || raw === null ? {} : record(raw, key);
  return Object.fromEntries(LOCALES.map(locale => [locale, text(value, locale, max) ?? ''])) as Record<Locale, string>;
}

export function parseGeoPlaceModel(raw: unknown): GeoPlaceModel | null {
  if (raw === undefined || raw === null) return null;
  const value = record(raw, 'Model');
  const modelUrl = text(value, 'modelUrl', 500);
  if (!modelUrl) return null;
  if (!isModelUrl(modelUrl)) throw ApiError.validation('Model must be a .glb media key (media/...) or site path (/markers/...)');
  const status = value.status === 'published' ? 'published' : value.status === undefined || value.status === 'draft' ? 'draft' : null;
  if (!status) throw ApiError.validation('Invalid model status');
  return {
    modelUrl, status,
    scale: number(value.scale, 'scale', 0.0001, 1000, 1),
    heading: number(value.heading, 'heading', -360, 360, 0),
    pitch: number(value.pitch, 'pitch', -180, 180, 0),
    roll: number(value.roll, 'roll', -180, 180, 0),
    heightOffset: number(value.heightOffset, 'heightOffset', -1000, 1000, 0),
  };
}

export function parseGeoPlaceInput(raw: unknown): GeoPlaceInput {
  const value = record(raw, 'Place');
  const names = localized(value.names, 'names', 200);
  if (!LOCALES.some(locale => names[locale])) throw ApiError.validation('Place name required');
  const type = text(value, 'type', 40) ?? '';
  if (!(PLACE_TYPES as readonly string[]).includes(type)) throw ApiError.validation('Invalid place type');
  const countryCode = text(value, 'countryCode', 2)?.toUpperCase() ?? null;
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw ApiError.validation('Country must be an ISO 3166-1 alpha-2 code');
  const source = text(value, 'source', 2000);
  if (source) {
    try { if (!['https:', 'http:'].includes(new URL(source).protocol)) throw new Error(); }
    catch { throw ApiError.validation('Source must be an HTTP(S) URL'); }
  }
  const altitude = value.altitude === undefined || value.altitude === null || value.altitude === '' ? null : number(value.altitude, 'altitude', -500, 9000);
  return {
    names, type, countryCode,
    region: text(value, 'region', 120), city: text(value, 'city', 120), district: text(value, 'district', 120),
    address: localized(value.address, 'address', 500),
    lat: number(value.lat, 'latitude', -90, 90), lon: number(value.lon, 'longitude', -180, 180), altitude,
    verified: value.verified === true, showOnGlobe: value.showOnGlobe === true,
    source, model: parseGeoPlaceModel(value.model),
  };
}

type PlaceRow = {id: string; canonical_name: string; place_type: string; country_code: string | null; region: string | null; city: string | null; district: string | null;
  lat: number | null; lon: number | null; altitude: number | null; match_status: string; geo_status: string; has_profile: number; public_visible: number};

export async function listGeoPlaces(search = '', limit = 50): Promise<GeoPlaceSummary[]> {
  const db = await getDb(), like = `%${search.trim().toLowerCase()}%`;
  const {results} = await db.prepare(
    `SELECT p.id, COALESCE(NULLIF(tu.name,''), NULLIF(te.name,''), p.canonical_name) AS title, p.place_type AS type, p.country_code AS countryCode,
      p.city, p.region, p.lat, p.lon, EXISTS(SELECT 1 FROM calendar_geo_place_models m WHERE m.place_id=p.id) AS hasModel
     FROM calendar_geo_places p
     LEFT JOIN calendar_geo_translations tu ON tu.place_id=p.id AND tu.locale='uk'
     LEFT JOIN calendar_geo_translations te ON te.place_id=p.id AND te.locale='en'
     WHERE ?='%%' OR lower(p.canonical_name) LIKE ? OR lower(COALESCE(tu.name,'')) LIKE ? OR lower(p.id) LIKE ? OR lower(COALESCE(p.city,'')) LIKE ?
     GROUP BY p.id ORDER BY title LIMIT ?`,
  ).bind(like, like, like, like, like, Math.max(1, Math.min(200, limit))).all<Omit<GeoPlaceSummary, 'hasModel'> & {hasModel: number}>();
  return results.map(row => ({...row, hasModel: row.hasModel === 1}));
}

export async function getGeoPlace(id: string): Promise<GeoPlaceRecord> {
  const db = await getDb();
  const place = await db.prepare(
    `SELECT id, canonical_name, place_type, country_code, region, city, district, lat, lon, altitude, match_status, geo_status,
      EXISTS(SELECT 1 FROM calendar_geo_place_profiles pr WHERE pr.place_id=calendar_geo_places.id) AS has_profile,
      COALESCE((SELECT pr.public_visible FROM calendar_geo_place_profiles pr WHERE pr.place_id=calendar_geo_places.id), 0) AS public_visible
     FROM calendar_geo_places WHERE id=?`).bind(id).first<PlaceRow>();
  if (!place) throw ApiError.notFound('Unknown place');
  const [{results: names}, {results: addresses}, model, {results: saints}] = await Promise.all([
    db.prepare('SELECT locale, name FROM calendar_geo_translations WHERE place_id=?').bind(id).all<{locale: string; name: string}>(),
    db.prepare('SELECT locale, address FROM calendar_geo_place_profile_translations WHERE place_id=?').bind(id).all<{locale: string; address: string}>(),
    db.prepare('SELECT model_url AS modelUrl, scale, heading, pitch, roll, height_offset AS heightOffset, status FROM calendar_geo_place_models WHERE place_id=?').bind(id).first<GeoPlaceModel>(),
    db.prepare(`SELECT r.entity_id AS entityId, e.canonical_name AS title, r.relation_type AS relationType FROM calendar_geo_relations r
      JOIN calendar_geo_entities e ON e.id=r.entity_id WHERE r.place_id=? AND e.entity_type='saint' ORDER BY title`).bind(id).all<{entityId: string; title: string; relationType: string}>(),
  ]);
  const pick = (rows: {locale: string}[], field: 'name' | 'address') =>
    Object.fromEntries(LOCALES.map(locale => [locale, String((rows.find(row => row.locale === locale) as Record<string, unknown> | undefined)?.[field] ?? '')])) as Record<Locale, string>;
  return {
    id: place.id, canonicalName: place.canonical_name, names: pick(names, 'name'), type: place.place_type,
    countryCode: place.country_code, region: place.region, city: place.city, district: place.district,
    address: pick(addresses, 'address'), lat: place.lat, lon: place.lon, altitude: place.altitude,
    verified: place.match_status === 'reviewed_verified' && place.geo_status === 'reviewed_verified',
    hasProfile: place.has_profile === 1, showOnGlobe: place.has_profile === 1 && place.public_visible === 1, model: model ?? null, saints,
  };
}

function modelStatements(db: D1Database, placeId: string, model: GeoPlaceModel | null) {
  if (!model) return [db.prepare('DELETE FROM calendar_geo_place_models WHERE place_id=?').bind(placeId)];
  return [db.prepare(
    `INSERT INTO calendar_geo_place_models(place_id, model_url, scale, heading, pitch, roll, height_offset, status) VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(place_id) DO UPDATE SET model_url=excluded.model_url, scale=excluded.scale, heading=excluded.heading, pitch=excluded.pitch,
      roll=excluded.roll, height_offset=excluded.height_offset, status=excluded.status`,
  ).bind(placeId, model.modelUrl, model.scale, model.heading, model.pitch, model.roll, model.heightOffset, model.status)];
}
function adminSource(db: D1Database) {
  return db.prepare("INSERT OR IGNORE INTO calendar_geo_sources(id, source_type, source_url, retrieved_at) VALUES(?, 'manual', 'internal:svetikony-admin', ?)").bind(ADMIN_SOURCE_ID, new Date().toISOString());
}
async function translationStatements(db: D1Database, placeId: string, input: GeoPlaceInput, sourceId: string) {
  const {results} = await db.prepare('SELECT id, locale FROM calendar_geo_translations WHERE place_id=?').bind(placeId).all<{id: string; locale: string}>();
  const statements: D1PreparedStatement[] = [];
  for (const locale of LOCALES) {
    const name = input.names[locale];
    if (!name) continue;
    const existing = results.find(row => row.locale === locale);
    statements.push(existing
      ? db.prepare('UPDATE calendar_geo_translations SET name=? WHERE id=?').bind(name, existing.id)
      : db.prepare("INSERT INTO calendar_geo_translations(id, place_id, locale, name, translation_status, source_locale, source_id) VALUES(?,?,?,?,'source',?,?)")
        .bind(`translation:${placeId}:${locale}`, placeId, locale, name, locale, sourceId));
  }
  return statements;
}
/** "Show on the public globe" is only calendar_geo_place_profiles.public_visible:
 * switching it off hides the place and never deletes the profile, addresses,
 * history, saint links, territory or 3D model. A profile row is created only
 * when it is needed (shown, or it has an address to keep). */
function profileStatements(db: D1Database, placeId: string, input: GeoPlaceInput, hasProfile: boolean) {
  const needed = hasProfile || input.showOnGlobe || LOCALES.some(locale => input.address[locale]);
  if (!needed) return [];
  const statements = [db.prepare(
    `INSERT INTO calendar_geo_place_profiles(place_id, public_visible) VALUES(?, ?)
     ON CONFLICT(place_id) DO UPDATE SET public_visible=excluded.public_visible`).bind(placeId, input.showOnGlobe ? 1 : 0)];
  for (const locale of LOCALES) statements.push(db.prepare(
    `INSERT INTO calendar_geo_place_profile_translations(place_id, locale, address) VALUES(?,?,?)
     ON CONFLICT(place_id, locale) DO UPDATE SET address=excluded.address`).bind(placeId, locale, input.address[locale]));
  return statements;
}

/** Manual verification: ticking it marks the place reviewed; unticking only
 * downgrades a place an admin had verified -- machine-matched (Wikidata)
 * places keep their original status so the calendar globe keeps them. */
const VERIFY_SQL = `verification_status = CASE WHEN ?1=1 THEN 'verified' WHEN match_status='reviewed_verified' THEN 'needs_review' ELSE verification_status END,
  geo_status = CASE WHEN ?1=1 THEN 'reviewed_verified' WHEN geo_status='reviewed_verified' THEN 'manual_unverified' ELSE geo_status END,
  match_status = CASE WHEN ?1=1 THEN 'reviewed_verified' WHEN match_status='reviewed_verified' THEN 'needs_review' ELSE match_status END`;

export async function updateGeoPlace(id: string, raw: unknown): Promise<GeoPlaceRecord> {
  const input = parseGeoPlaceInput(raw), db = await getDb();
  const existing = await db.prepare('SELECT EXISTS(SELECT 1 FROM calendar_geo_place_profiles WHERE place_id=?) AS has_profile, (SELECT id FROM calendar_geo_places WHERE id=?) AS id').bind(id, id).first<{has_profile: number; id: string | null}>();
  if (!existing?.id) throw ApiError.notFound('Unknown place');
  const statements: D1PreparedStatement[] = [adminSource(db),
    db.prepare(`UPDATE calendar_geo_places SET place_type=?2, country_code=?3, region=?4, city=?5, district=?6, lat=?7, lon=?8, altitude=?9,
      ${VERIFY_SQL.replaceAll('?1', '?10')} WHERE id=?1`)
      .bind(id, input.type, input.countryCode, input.region, input.city, input.district, input.lat, input.lon, input.altitude, input.verified ? 1 : 0),
    ...await translationStatements(db, id, input, ADMIN_SOURCE_ID),
    ...profileStatements(db, id, input, existing.has_profile === 1),
    ...modelStatements(db, id, input.model),
  ];
  if (input.source) {
    const sourceId = `source:${crypto.randomUUID()}`;
    statements.push(
      db.prepare("INSERT INTO calendar_geo_sources(id, source_type, source_url, retrieved_at) VALUES(?, 'manual', ?, ?)").bind(sourceId, input.source, new Date().toISOString()),
      db.prepare("INSERT INTO calendar_geo_provenance(id, place_id, field_name, source_id, value_json) VALUES(?, ?, 'coordinates', ?, ?)")
        .bind(`provenance:${crypto.randomUUID()}`, id, sourceId, JSON.stringify({lat: input.lat, lon: input.lon, altitude: input.altitude})),
    );
  }
  await db.batch(statements);
  return getGeoPlace(id);
}

/** Same idempotency contract as createMarkerPlace: a stable per-form
 * requestId makes a retried POST return the same place, never a second pin. */
export async function createGeoPlace(raw: unknown): Promise<GeoPlaceRecord> {
  const value = record(raw, 'Place');
  const requestId = typeof value.requestId === 'string' ? value.requestId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw ApiError.validation('Invalid request ID');
  const input = parseGeoPlaceInput(value);
  if (!input.source) throw ApiError.validation('Source of the place data is required');
  const db = await getDb(), id = `manual:${requestId}`;
  if (await db.prepare('SELECT id FROM calendar_geo_places WHERE id=?').bind(id).first()) return getGeoPlace(id);
  const sourceId = `source:${requestId}`;
  const canonical = input.names.uk || input.names.en || input.names.ru;
  const [status, geo, verification] = input.verified ? ['reviewed_verified', 'reviewed_verified', 'verified'] : ['needs_review', 'manual_unverified', 'needs_review'];
  await db.batch([
    db.prepare(`INSERT INTO calendar_geo_places(id, canonical_name, place_type, country_code, region, city, district, lat, lon, altitude, verification_status, match_status, geo_status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, canonical, input.type, input.countryCode, input.region, input.city, input.district, input.lat, input.lon, input.altitude, verification, status, geo),
    db.prepare("INSERT INTO calendar_geo_sources(id, source_type, source_url, retrieved_at) VALUES(?, 'manual', ?, ?)").bind(sourceId, input.source, new Date().toISOString()),
    ...LOCALES.filter(locale => input.names[locale]).map(locale => db.prepare("INSERT INTO calendar_geo_translations(id, place_id, locale, name, translation_status, source_locale, source_id) VALUES(?,?,?,?,'source',?,?)")
      .bind(`translation:${id}:${locale}`, id, locale, input.names[locale], locale, sourceId)),
    ...profileStatements(db, id, input, false),
    db.prepare("INSERT INTO calendar_geo_provenance(id, place_id, field_name, source_id, value_json) VALUES(?, ?, 'coordinates', ?, ?)")
      .bind(`provenance:${requestId}`, id, sourceId, JSON.stringify({lat: input.lat, lon: input.lon, altitude: input.altitude})),
    ...modelStatements(db, id, input.model),
  ]);
  return getGeoPlace(id);
}

// ---------------------------------------------------------------- saints --

const CREDIBLE = ['machine_high', 'reviewed_verified'];
export type SaintPlaceLink = {
  entityId: string; placeId: string; relationType: string; place: GeoPlaceSummary;
  /** Confirmed by an administrator (setSaintPlaceVerified). */
  linkVerified: boolean;
  /** Place confirmed by an administrator (place editor checkbox). */
  placeVerified: boolean;
  /** Shown on the public sacred-places globe layer (public_visible). */
  placeVisible: boolean;
  /** Every condition the public calendar globe requires for this saint-place pin:
   * credible saint, link and place statuses plus coordinates. */
  calendarReady: boolean;
};

async function saintEntities(db: D1Database, groupId: string) {
  const {results} = await db.prepare(`SELECT e.id, e.canonical_name AS title, e.match_status AS matchStatus FROM calendar_geo_content_links l JOIN calendar_geo_entities e ON e.id=l.entity_id
    WHERE l.content_type='saint' AND l.translation_group_id=? AND e.entity_type='saint' ORDER BY (e.id = 'internal:saint:' || ?) DESC, e.id`).bind(groupId, groupId).all<{id: string; title: string; matchStatus: string}>();
  return results;
}

export async function listSaintPlaces(groupId: string): Promise<{entities: {id: string; title: string; matchStatus: string; credible: boolean}[]; links: SaintPlaceLink[]}> {
  if (!groupId) throw ApiError.validation('Saint group required');
  const db = await getDb(), rows = await saintEntities(db, groupId);
  const entities = rows.map(entity => ({...entity, credible: CREDIBLE.includes(entity.matchStatus)}));
  if (!entities.length) return {entities, links: []};
  const {results} = await db.prepare(
    `SELECT r.entity_id AS entityId, r.place_id AS placeId, r.relation_type AS relationType,
      COALESCE(NULLIF(tu.name,''), NULLIF(te.name,''), p.canonical_name) AS title, p.place_type AS type, p.country_code AS countryCode, p.city, p.region, p.lat, p.lon,
      EXISTS(SELECT 1 FROM calendar_geo_place_models m WHERE m.place_id=p.id) AS hasModel,
      r.match_status AS relMatch, r.geo_status AS relGeo, p.match_status AS placeMatch, p.geo_status AS placeGeo,
      EXISTS(SELECT 1 FROM calendar_geo_place_profiles pr WHERE pr.place_id=p.id AND pr.public_visible=1) AS placeVisible
     FROM calendar_geo_relations r JOIN calendar_geo_places p ON p.id=r.place_id
     LEFT JOIN calendar_geo_translations tu ON tu.place_id=p.id AND tu.locale='uk'
     LEFT JOIN calendar_geo_translations te ON te.place_id=p.id AND te.locale='en'
     WHERE r.entity_id IN (${entities.map(() => '?').join(',')})
     GROUP BY r.entity_id, r.place_id, r.relation_type ORDER BY title`,
  ).bind(...entities.map(entity => entity.id)).all<{entityId: string; placeId: string; relationType: string; title: string; type: string; countryCode: string | null; city: string | null; region: string | null; lat: number | null; lon: number | null; hasModel: number;
    relMatch: string; relGeo: string; placeMatch: string; placeGeo: string; placeVisible: number}>();
  return {entities, links: results.map(row => {
    const entityCredible = entities.find(entity => entity.id === row.entityId)?.credible ?? false;
    const linkCredible = CREDIBLE.includes(row.relMatch) && CREDIBLE.includes(row.relGeo);
    const placeCredible = CREDIBLE.includes(row.placeMatch) && CREDIBLE.includes(row.placeGeo);
    return {entityId: row.entityId, placeId: row.placeId, relationType: row.relationType,
      place: {id: row.placeId, title: row.title, type: row.type, countryCode: row.countryCode, city: row.city, region: row.region, lat: row.lat, lon: row.lon, hasModel: row.hasModel === 1},
      linkVerified: row.relMatch === 'reviewed_verified' && row.relGeo === 'reviewed_verified',
      placeVerified: row.placeMatch === 'reviewed_verified' && row.placeGeo === 'reviewed_verified',
      placeVisible: row.placeVisible === 1,
      calendarReady: entityCredible && linkCredible && placeCredible && row.lat !== null && row.lon !== null};
  })};
}

function parseLink(raw: unknown) {
  const value = record(raw, 'Link');
  const groupId = typeof value.groupId === 'string' ? value.groupId.trim() : '';
  const placeId = typeof value.placeId === 'string' ? value.placeId.trim() : '';
  const relationType = typeof value.relationType === 'string' ? value.relationType : 'veneration';
  if (!groupId || !placeId) throw ApiError.validation('Saint and place required');
  if (!(RELATION_TYPES as readonly string[]).includes(relationType)) throw ApiError.validation('Invalid relation type');
  return {groupId, placeId, relationType};
}

/** Links a CMS saint (translation group) to a place. Reuses the saint's
 * existing geo entity; if it has none yet, creates the conventional
 * `internal:saint:<groupId>` entity + content link (never a parallel table). */
export async function linkSaintPlace(raw: unknown) {
  const {groupId, placeId, relationType} = parseLink(raw), db = await getDb();
  const saint = await db.prepare("SELECT name FROM church_saints WHERE translation_group_id=? ORDER BY CASE language WHEN 'uk' THEN 0 WHEN 'en' THEN 1 ELSE 2 END LIMIT 1").bind(groupId).first<{name: string}>();
  if (!saint) throw ApiError.notFound('Unknown saint group');
  if (!await db.prepare('SELECT id FROM calendar_geo_places WHERE id=?').bind(placeId).first()) throw ApiError.notFound('Unknown place');
  const entities = await saintEntities(db, groupId);
  const entityId = entities[0]?.id ?? `internal:saint:${groupId}`;
  const statements: D1PreparedStatement[] = [adminSource(db)];
  // A new saint entity starts with the schema's own review defaults
  // (needs_review); linking never changes any entity's review status.
  if (!entities.length) statements.push(
    db.prepare("INSERT OR IGNORE INTO calendar_geo_entities(id, entity_type, canonical_name) VALUES(?, 'saint', ?)").bind(entityId, saint.name),
    db.prepare("INSERT OR IGNORE INTO calendar_geo_content_links(entity_id, content_type, translation_group_id) VALUES(?, 'saint', ?)").bind(entityId, groupId),
  );
  // Linking and verification are independent: a new link is unconfirmed, an
  // existing one keeps whatever confirmation it already had.
  statements.push(db.prepare(
    `INSERT OR IGNORE INTO calendar_geo_relations(entity_id, place_id, relation_type, source_id, verification_status, match_status, geo_status)
     VALUES(?,?,?,?, 'needs_review', 'needs_review', 'manual_unverified')`,
  ).bind(entityId, placeId, relationType, ADMIN_SOURCE_ID));
  await db.batch(statements);
  return listSaintPlaces(groupId);
}

/** Explicit administrator confirmation of one saint <-> place link -- the
 * only way a link becomes 'reviewed_verified'. Unconfirming only resets
 * links an admin had confirmed back to review (machine links keep theirs). */
export async function setSaintPlaceVerified(raw: unknown) {
  const {groupId, placeId, relationType} = parseLink(raw), db = await getDb();
  const value = record(raw, 'Link');
  if (typeof value.verified !== 'boolean') throw ApiError.validation('verified must be true or false');
  const entities = await saintEntities(db, groupId);
  if (!entities.length) throw ApiError.notFound('Saint has no linked places');
  const ids = entities.map(entity => entity.id);
  const result = await db.prepare(
    `UPDATE calendar_geo_relations SET
      verification_status = CASE WHEN ?1=1 THEN 'verified' ELSE 'needs_review' END,
      match_status = CASE WHEN ?1=1 THEN 'reviewed_verified' WHEN match_status='reviewed_verified' THEN 'needs_review' ELSE match_status END,
      geo_status = CASE WHEN ?1=1 THEN 'reviewed_verified' WHEN geo_status='reviewed_verified' THEN 'manual_unverified' ELSE geo_status END
     WHERE place_id=?2 AND relation_type=?3 AND entity_id IN (${ids.map((_, index) => `?${index + 4}`).join(',')})`,
  ).bind(value.verified ? 1 : 0, placeId, relationType, ...ids).run();
  if (!result.meta?.changes) throw ApiError.notFound('Unknown saint place link');
  return listSaintPlaces(groupId);
}

export async function unlinkSaintPlace(raw: unknown) {
  const {groupId, placeId, relationType} = parseLink(raw), db = await getDb();
  const entities = await saintEntities(db, groupId);
  if (entities.length) await db.prepare(`DELETE FROM calendar_geo_relations WHERE place_id=? AND relation_type=? AND entity_id IN (${entities.map(() => '?').join(',')})`)
    .bind(placeId, relationType, ...entities.map(entity => entity.id)).run();
  return listSaintPlaces(groupId);
}
