import {d1All, d1First} from '@/lib/d1/db';
import {ApiError} from '@/lib/d1/errors';
import {fromD1Bool, fromD1Json} from '@/lib/d1/mappers';
import {resolveMediaUrl} from '@/lib/media/resolver';

/**
 * SacredPlacePanel data (GlobeShell pilot, Kyiv-Pechersk Lavra scope).
 * Keyed by calendar_geo_places.id ("placeId"), which is a separate key
 * space from calendar_geo_entities.id used by lib/d1/repositories/calendarGeo.ts
 * -- see the architecture report: marker, territory polygon and panel all
 * share one placeId, independent of the existing entity-based day/detail
 * flow, which is left untouched.
 */

type Locale = 'uk' | 'ru' | 'en';

export type PlaceTerritory = { type: 'Polygon' | 'MultiPolygon'; geometry: unknown };

/** Lightweight place-to-place navigation entry (calendar_geo_place_relations)
 * -- deliberately NOT a full PlaceProfile: only what SacredPlacePanel needs
 * to render a "part of the Lavra" / "objects in the complex" link and fly
 * the camera there, never the parent/child's own history/collection. */
export type PlaceRelation = {
  id: string;
  title: string;
  type: string;
  lat: number;
  lon: number;
  relationType: string;
};

export type PlaceProfile = {
  id: string;
  hasProfile: boolean;
  history: string;
  address: string;
  directions: string;
  openingHours: Record<string, string>;
  websiteUrl: string | null;
  mapUrl: string | null;
  territory: PlaceTerritory | null;
  parentPlaces: PlaceRelation[];
  childPlaces: PlaceRelation[];
};

export type PlaceCollectionItem = {
  id: string;
  slug: string;
  title: string;
  photoUrl: string;
  priceCents: number;
  currency: string;
  stockStatus: string;
  relationType: 'primary' | 'related';
  caption: string;
  /** icon_order_options.production_time / .description -- real catalog
   * fields, straight passthrough, for the Collection tab's metadata rows.
   * Never invent a value here when the row is blank. */
  productionTime: string;
  description: string;
};

export type SacredPlaceMarker = {
  id: string;
  lat: number;
  lon: number;
  type: string;
  importance: number;
  title: string;
  hasTerritory: boolean;
  hasCollection: boolean;
  /** calendar_geo_places.region / .country_code, straight passthrough -- for
   * the panel header's "city, country" subtitle (country name resolved
   * client-side against lib/visualizer/countries.ts's countryMetadata, the
   * same table the globe's own country layer already uses). */
  region: string | null;
  countryCode: string | null;
};

async function placeExists(placeId: string): Promise<boolean> {
  const row = await d1First<{found: number}>('SELECT EXISTS(SELECT 1 FROM calendar_geo_places WHERE id = ?) AS found', placeId);
  return row?.found === 1;
}

/** Used by lib/d1/repositories/calendarGeo.ts's calendarGeoEntity() to add
 * optional hasProfile/hasCollection flags to each item in its `places[]`
 * response -- the existing entity endpoint's own shape and callers are left
 * untouched, this only enriches items that already carry a placeId. */
export async function getSacredFlagsForPlaceIds(placeIds: string[]): Promise<Record<string, {hasProfile: boolean; hasCollection: boolean}>> {
  const unique = [...new Set(placeIds)];
  if (!unique.length) return {};
  const placeholders = unique.map(() => '?').join(',');
  const rows = await d1All<{placeId: string; hasProfile: number; hasCollection: number}>(
    `SELECT pl.id AS placeId,
      EXISTS(SELECT 1 FROM calendar_geo_place_profiles prof WHERE prof.place_id = pl.id) AS hasProfile,
      EXISTS(SELECT 1 FROM calendar_geo_place_products pp JOIN icon_order_options o ON o.id = pp.product_id AND o.is_active = 1 WHERE pp.place_id = pl.id) AS hasCollection
     FROM calendar_geo_places pl WHERE pl.id IN (${placeholders})`,
    ...unique
  );
  return Object.fromEntries(rows.map((row) => [row.placeId, {hasProfile: fromD1Bool(row.hasProfile), hasCollection: fromD1Bool(row.hasCollection)}]));
}

/**
 * Place-to-place hierarchy navigation (calendar_geo_place_relations, 0034).
 * direction='parent' resolves places for which the given placeId is the
 * CHILD (e.g. from Uspensky Sobor: the Lavra); direction='child' resolves
 * places for which it is the PARENT (e.g. from the Lavra: Uspensky Sobor).
 * Deliberately independent of calendar_geo_place_profiles/hasProfile -- the
 * hierarchy fact lives on calendar_geo_places itself, so it's returned even
 * for a place with no curated profile row yet.
 *
 * Title resolution follows the same convention as listSacredPlaces' marker
 * titles: requested locale -> en fallback -> canonical_name.
 *
 * verification_status is intentionally not filtered on -- a 'needs_review'
 * relation (like the pilot seed's Lavra/Sobor row) still has to render; only
 * a production review workflow, not this read path, should gate that.
 *
 * `r.parent_place_id != r.child_place_id` and the id/seen dedup below guard
 * against a place linked to itself, or the same pair showing up twice under
 * different relation_type rows, ever surfacing as duplicate/self entries.
 */
/** Same requested-locale -> en -> fallback pattern as productTitle() below,
 * applied in JS (not SQL) specifically so it stays unit-testable against
 * mocked rows without a real database -- see getRelatedPlaces. */
function relationTitle(row: {nameLocale: string | null; nameEn: string | null; canonicalName: string}): string {
  return row.nameLocale || row.nameEn || row.canonicalName || '';
}

async function getRelatedPlaces(placeId: string, locale: Locale, direction: 'parent' | 'child'): Promise<PlaceRelation[]> {
  const otherIdColumn = direction === 'parent' ? 'parent_place_id' : 'child_place_id';
  const ownIdColumn = direction === 'parent' ? 'child_place_id' : 'parent_place_id';
  const rows = await d1All<{id: string; type: string; lat: number; lon: number; relationType: string; nameLocale: string | null; nameEn: string | null; canonicalName: string}>(
    `SELECT p.id, p.place_type AS type, p.lat, p.lon, r.relation_type AS relationType,
      t.name AS nameLocale, te.name AS nameEn, p.canonical_name AS canonicalName
     FROM calendar_geo_place_relations r
     JOIN calendar_geo_places p ON p.id = r.${otherIdColumn}
     LEFT JOIN calendar_geo_translations t ON t.place_id = p.id AND t.locale = ?
     LEFT JOIN calendar_geo_translations te ON te.place_id = p.id AND te.locale = 'en'
     WHERE r.${ownIdColumn} = ? AND r.parent_place_id != r.child_place_id`,
    locale, placeId
  );
  const seen = new Set<string>();
  const result: PlaceRelation[] = [];
  for (const row of rows) {
    if (row.id === placeId || seen.has(row.id)) continue;
    seen.add(row.id);
    result.push({id: row.id, title: relationTitle(row), type: row.type, lat: row.lat, lon: row.lon, relationType: row.relationType});
  }
  return result;
}

export async function getPlaceProfile(placeId: string, locale: Locale): Promise<PlaceProfile> {
  if (!(await placeExists(placeId))) throw ApiError.notFound('Unknown place');

  const [parentPlaces, childPlaces] = await Promise.all([
    getRelatedPlaces(placeId, locale, 'parent'),
    getRelatedPlaces(placeId, locale, 'child')
  ]);

  const profile = await d1First<{
    websiteUrl: string | null;
    mapUrl: string | null;
    openingHoursJson: string;
    historyText: string;
    address: string;
    directions: string;
  }>(
    `SELECT p.website_url AS websiteUrl, p.map_url AS mapUrl, p.opening_hours_json AS openingHoursJson,
      COALESCE(NULLIF(t.history_text,''), te.history_text, '') AS historyText,
      COALESCE(NULLIF(t.address,''), te.address, '') AS address,
      COALESCE(NULLIF(t.directions,''), te.directions, '') AS directions
     FROM calendar_geo_place_profiles p
     LEFT JOIN calendar_geo_place_profile_translations t ON t.place_id = p.place_id AND t.locale = ?
     LEFT JOIN calendar_geo_place_profile_translations te ON te.place_id = p.place_id AND te.locale = 'en'
     WHERE p.place_id = ?`,
    locale, placeId
  );

  if (!profile) {
    return {id: placeId, hasProfile: false, history: '', address: '', directions: '', openingHours: {}, websiteUrl: null, mapUrl: null, territory: null, parentPlaces, childPlaces};
  }

  // Only the first territory (oldest created_at) is surfaced today -- the
  // schema allows several polygons per place (see 0034's comment), but the
  // pilot seeds exactly one each and the panel only needs one to render.
  const territoryRow = await d1First<{geometryType: 'Polygon' | 'MultiPolygon'; geometryJson: string}>(
    `SELECT geometry_type AS geometryType, geometry_json AS geometryJson FROM calendar_geo_place_territories
     WHERE place_id = ? ORDER BY created_at ASC LIMIT 1`,
    placeId
  );
  const territory: PlaceTerritory | null = territoryRow
    ? {type: territoryRow.geometryType, geometry: JSON.parse(territoryRow.geometryJson)}
    : null;

  return {
    id: placeId,
    hasProfile: true,
    history: profile.historyText,
    address: profile.address,
    directions: profile.directions,
    openingHours: fromD1Json<Record<string, string>>(profile.openingHoursJson, {}),
    websiteUrl: profile.websiteUrl,
    mapUrl: profile.mapUrl,
    territory,
    parentPlaces,
    childPlaces
  };
}

function productTitle(row: {nameUk: string; nameRu: string; nameEn: string}, locale: Locale): string {
  const byLocale = {uk: row.nameUk, ru: row.nameRu, en: row.nameEn};
  return byLocale[locale] || row.nameEn || row.nameUk || row.nameRu || '';
}

export async function getPlaceCollection(placeId: string, locale: Locale): Promise<{placeId: string; items: PlaceCollectionItem[]}> {
  if (!(await placeExists(placeId))) throw ApiError.notFound('Unknown place');

  const rows = await d1All<{
    id: string; slug: string; nameUk: string; nameRu: string; nameEn: string;
    photoUrl: string; priceCents: number; currency: string; stockStatus: string;
    relationType: 'primary' | 'related'; caption: string; productionTime: string; description: string;
  }>(
    `SELECT o.id, o.slug, o.name_uk AS nameUk, o.name_ru AS nameRu, o.name_en AS nameEn,
      o.photo_url AS photoUrl, o.price_cents AS priceCents, o.currency, o.stock_status AS stockStatus,
      pp.relation_type AS relationType, o.production_time AS productionTime, o.description AS description,
      COALESCE(NULLIF(c.caption,''), ce.caption, '') AS caption
     FROM calendar_geo_place_products pp
     JOIN icon_order_options o ON o.id = pp.product_id AND o.is_active = 1
     LEFT JOIN calendar_geo_place_product_captions c ON c.place_id = pp.place_id AND c.product_id = pp.product_id AND c.locale = ?
     LEFT JOIN calendar_geo_place_product_captions ce ON ce.place_id = pp.place_id AND ce.product_id = pp.product_id AND ce.locale = 'en'
     WHERE pp.place_id = ?
     ORDER BY pp.sort_order ASC, pp.created_at ASC`,
    locale, placeId
  );

  const items = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: productTitle(row, locale),
    photoUrl: resolveMediaUrl(row.photoUrl) ?? '',
    priceCents: row.priceCents,
    currency: row.currency,
    stockStatus: row.stockStatus,
    relationType: row.relationType,
    caption: row.caption,
    productionTime: row.productionTime || '',
    description: row.description || ''
  }));

  return {placeId, items};
}

export type PlacesBbox = {west: number; south: number; east: number; north: number};

/**
 * Marker list for the globe. Deliberately scoped to places that have a
 * curated calendar_geo_place_profiles row -- calendar_geo_places also holds
 * plain birth/death/burial locations for ordinary calendar entities that
 * have no Sacred Place panel content, and those must not turn into pins
 * requiring a panel that doesn't exist for them.
 *
 * zoom is an optional, deliberately crude decimation knob for the pilot: at
 * low zoom only the highest-importance places are returned. It's a
 * placeholder for real clustering, not a finished algorithm -- the point is
 * that the response shape/contract already supports thousands of rows
 * without the client ever fetching the full catalog.
 */
export async function listSacredPlaces(bbox: PlacesBbox, zoom: number | null, locale: Locale): Promise<SacredPlaceMarker[]> {
  const lowZoom = zoom !== null && zoom < 6 ? 1 : 0;
  const rows = await d1All<{
    id: string; lat: number; lon: number; type: string; importance: number; title: string;
    hasTerritory: number; hasCollection: number; region: string | null; countryCode: string | null;
  }>(
    `SELECT * FROM (
       SELECT pl.id, pl.lat, pl.lon, pl.place_type AS type,
        CASE pl.place_type WHEN 'monastery' THEN 90 WHEN 'shrine' THEN 90 WHEN 'church' THEN 80 WHEN 'pilgrimage_place' THEN 70 ELSE 50 END AS importance,
        COALESCE(NULLIF(t.name,''), te.name, pl.canonical_name) AS title,
        EXISTS(SELECT 1 FROM calendar_geo_place_territories tr WHERE tr.place_id = pl.id) AS hasTerritory,
        EXISTS(SELECT 1 FROM calendar_geo_place_products pp JOIN icon_order_options o ON o.id = pp.product_id AND o.is_active = 1 WHERE pp.place_id = pl.id) AS hasCollection,
        pl.region AS region, pl.country_code AS countryCode
       FROM calendar_geo_places pl
       JOIN calendar_geo_place_profiles prof ON prof.place_id = pl.id
       LEFT JOIN calendar_geo_translations t ON t.place_id = pl.id AND t.locale = ?
       LEFT JOIN calendar_geo_translations te ON te.place_id = pl.id AND te.locale = 'en'
       WHERE pl.lat BETWEEN ? AND ? AND pl.lon BETWEEN ? AND ?
     ) WHERE ? = 0 OR importance >= 80
     ORDER BY importance DESC, id`,
    locale, bbox.south, bbox.north, bbox.west, bbox.east, lowZoom
  );
  return rows.map((row) => ({...row, hasTerritory: fromD1Bool(row.hasTerritory), hasCollection: fromD1Bool(row.hasCollection)}));
}
