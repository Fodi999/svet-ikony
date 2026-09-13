import { d1Run } from '@/lib/d1/db';
import { ApiError } from '@/lib/d1/errors';
import { getCalendarDay } from '@/lib/d1/repositories/calendarDays';

/** Share one existing asset with an empty draft translation, retaining AI provenance. */
export async function shareCalendarImage(targetId: string, sourceId: string) {
  if (typeof sourceId !== 'string' || !sourceId) throw ApiError.validation('sourceId is required');
  const [source, target] = await Promise.all([getCalendarDay(sourceId), getCalendarDay(targetId)]);
  if (!source.translationGroupId || source.translationGroupId !== target.translationGroupId || source.dateNewStyle !== target.dateNewStyle) throw ApiError.validation('Translations must belong to the same calendar day');
  if (target.status !== 'draft') throw ApiError.conflict('Only draft translations may receive a shared image');
  if (!source.imageUrl) throw ApiError.validation('Source image is missing');
  if (target.imageUrl) {
    if (target.imageUrl === source.imageUrl) return target;
    throw ApiError.conflict('Target already has a different image');
  }
  const result = await d1Run(`UPDATE church_calendar_days
    SET image_url = ?, image_metadata = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND status = 'draft' AND COALESCE(image_url, '') = ''
      AND translation_group_id = ? AND date_new_style = ?
      AND EXISTS (SELECT 1 FROM church_calendar_days source WHERE source.id = ? AND source.image_url = ? AND source.updated_at = ?)`,
    source.imageUrl, source.imageMetadata ? JSON.stringify(source.imageMetadata) : null,
    targetId, source.translationGroupId, source.dateNewStyle, sourceId, source.imageUrl, source.updatedAt);
  if (!result.meta.changes) throw ApiError.conflict('Calendar image changed concurrently; refresh and retry');
  return getCalendarDay(targetId);
}
