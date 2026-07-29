import { d1First } from '../db';

/** Mirrors assistant/src/interfaces/http/church_prayer_visualizer.rs
 * fetch_asset_by_prayer_id — read-only. Row population itself happens via
 * the (not ported, see prayers.ts) background image-processing job, so this
 * will legitimately return null for every prayer until that pipeline is
 * ported too. */

type Row = {
  id: string;
  prayer_id: string;
  source_image_url: string;
  desktop_map_url: string;
  mobile_map_url: string;
  low_power_map_url: string;
  fallback_image_url: string;
  thumbnail_url: string;
  desktop_particle_count: number;
  mobile_particle_count: number;
  low_power_particle_count: number;
  processing_status: string;
  processing_error: string;
  processing_version: number;
  created_at: string;
  updated_at: string;
};

export type ChurchPrayerVisualizerAssetDto = {
  id: string;
  prayerId: string;
  sourceImageUrl: string;
  desktopMapUrl: string;
  mobileMapUrl: string;
  lowPowerMapUrl: string;
  fallbackImageUrl: string;
  thumbnailUrl: string;
  desktopParticleCount: number;
  mobileParticleCount: number;
  lowPowerParticleCount: number;
  processingStatus: string;
  processingError: string;
  processingVersion: number;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS =
  'id, prayer_id, source_image_url, desktop_map_url, mobile_map_url, low_power_map_url, fallback_image_url, thumbnail_url, desktop_particle_count, mobile_particle_count, low_power_particle_count, processing_status, processing_error, processing_version, created_at, updated_at';

function toDto(row: Row): ChurchPrayerVisualizerAssetDto {
  return {
    id: row.id,
    prayerId: row.prayer_id,
    sourceImageUrl: row.source_image_url,
    desktopMapUrl: row.desktop_map_url,
    mobileMapUrl: row.mobile_map_url,
    lowPowerMapUrl: row.low_power_map_url,
    fallbackImageUrl: row.fallback_image_url,
    thumbnailUrl: row.thumbnail_url,
    desktopParticleCount: row.desktop_particle_count,
    mobileParticleCount: row.mobile_particle_count,
    lowPowerParticleCount: row.low_power_particle_count,
    processingStatus: row.processing_status,
    processingError: row.processing_error,
    processingVersion: row.processing_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAssetByPrayerId(prayerId: string): Promise<ChurchPrayerVisualizerAssetDto | null> {
  const row = await d1First<Row>(`SELECT ${COLUMNS} FROM church_prayer_visualizer_assets WHERE prayer_id = ?`, prayerId);
  return row ? toDto(row) : null;
}
