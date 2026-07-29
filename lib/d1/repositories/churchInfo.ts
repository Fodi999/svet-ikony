import { d1First } from '../db';
import { fromD1Json, SVETIKONY_SITE_ID, toD1Json } from '../mappers';

/** Mirrors assistant/src/interfaces/http/church_content.rs get_church_info /
 * put_church_info. Postgres upserted via `ON CONFLICT (site_id) DO UPDATE`
 * — D1's church_info has no such unique key to conflict on (dropping
 * site_id removed the only column that constraint could apply to; see
 * 0001_svetikony_schema.sql's church_info comment), because with exactly
 * one tenant there is nothing left to be unique against. Replicated here as
 * "find the one row if it exists, else insert it" instead. */

type Row = {
  id: string;
  address: string;
  maps_url: string;
  phone_or_site: string;
  priest_phone: string;
  image_url: string;
  translations: string;
  gallery_images: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ChurchInfoDto = {
  id: string;
  siteId: string;
  address: string;
  mapsUrl: string;
  phoneOrSite: string;
  priestPhone: string;
  imageUrl: string;
  galleryImages: string[];
  translations: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ChurchInfoPayload = Partial<{
  address: string;
  mapsUrl: string;
  phoneOrSite: string;
  priestPhone: string;
  imageUrl: string;
  galleryImages: string[];
  translations: Record<string, unknown>;
  status: string;
}>;

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function emptyChurchInfo(): ChurchInfoDto {
  return {
    id: NIL_UUID,
    siteId: SVETIKONY_SITE_ID,
    address: '',
    mapsUrl: '',
    phoneOrSite: '',
    priestPhone: '',
    imageUrl: '',
    galleryImages: [],
    translations: {},
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  };
}

function toDto(row: Row): ChurchInfoDto {
  return {
    id: row.id,
    siteId: SVETIKONY_SITE_ID,
    address: row.address,
    mapsUrl: row.maps_url,
    phoneOrSite: row.phone_or_site,
    priestPhone: row.priest_phone,
    imageUrl: row.image_url,
    galleryImages: fromD1Json<string[]>(row.gallery_images, []),
    translations: fromD1Json<Record<string, unknown>>(row.translations, {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = 'id, address, maps_url, phone_or_site, priest_phone, image_url, translations, gallery_images, status, created_at, updated_at';

export async function getChurchInfo(): Promise<ChurchInfoDto> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_info LIMIT 1`);
  return row ? toDto(row) : emptyChurchInfo();
}

export async function putChurchInfo(payload: ChurchInfoPayload): Promise<ChurchInfoDto> {
  const existingId = await d1First<{ id: string }>('SELECT id FROM church_info LIMIT 1');

  const address = payload.address ?? '';
  const mapsUrl = payload.mapsUrl ?? '';
  const phoneOrSite = payload.phoneOrSite ?? '';
  const priestPhone = payload.priestPhone ?? '';
  const imageUrl = payload.imageUrl ?? '';
  const galleryImages = toD1Json(payload.galleryImages ?? []);
  const translations = toD1Json(payload.translations ?? {});
  const status = payload.status ?? 'draft';

  const row = existingId
    ? await d1First<Row>(
        `UPDATE church_info SET
           address = ?, maps_url = ?, phone_or_site = ?, priest_phone = ?, image_url = ?,
           gallery_images = ?, translations = ?, status = ?
         WHERE id = ?
         RETURNING ${COLUMNS}`,
        address, mapsUrl, phoneOrSite, priestPhone, imageUrl, galleryImages, translations, status, existingId.id
      )
    : await d1First<Row>(
        `INSERT INTO church_info (address, maps_url, phone_or_site, priest_phone, image_url, gallery_images, translations, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING ${COLUMNS}`,
        address, mapsUrl, phoneOrSite, priestPhone, imageUrl, galleryImages, translations, status
      );
  return toDto(row!);
}
