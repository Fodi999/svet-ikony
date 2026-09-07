import { d1All, d1First } from '../db';

/**
 * Phase 2B-6: a read-only aggregate over existing content/order tables —
 * deliberately NOT a persisted dashboard table (nothing here is ever
 * written to). One SQL statement with correlated scalar subqueries for
 * every count, mirroring the existing getTelegramStats() pattern
 * (lib/d1/repositories/telegram.ts) — one round trip, not one query per
 * KPI. Verified against real SQLite (node:sqlite) with seeded
 * representative rows during design before being ported here.
 *
 * Every field here is honestly computable from a real column:
 * - `missingTranslations` only covers church_icons/church_saints/
 *   church_calendar_days — church_gospel_readings and church_articles
 *   have no translation_group_id column at all (verified directly, not
 *   assumed; see the Phase 2B-2/2B-3 reports), so counting "missing
 *   translations" for them isn't a representable question, not just an
 *   unmocked one.
 * - `missingImages` only covers church_icons/church_saints (their real
 *   image_url columns) — church_articles has no image column, and
 *   church_calendar_days' own image_url is intentionally left out of
 *   scope here to match the admin's existing dashboard card semantics
 *   exactly rather than silently widening what the card has always meant
 *   (see the Phase 2B-6 report's REAL DATA SOURCES section).
 * - There is no `mediaUploadErrors` field at all: no upload-error-
 *   tracking table exists anywhere in this schema, so that stat is
 *   omitted entirely rather than faked as 0 (the admin's old mock
 *   literal) — see that same report section.
 */

export type DashboardStatsDto = {
  newOrders: number;
  unreadOrders: number;
  drafts: number;
  published: number;
  missingTranslations: number;
  missingImages: number;
  prayersWithoutAudio: number;
  upcomingCalendarDays: { id: string; title: string; date: string; status: string }[];
};

type AggregateRow = {
  new_orders: number;
  unread_orders: number;
  drafts: number;
  published: number;
  missing_translations: number;
  missing_images: number;
  prayers_without_audio: number;
};

type UpcomingDayRow = { id: string; title: string; date: string; status: string };

const AGGREGATE_SQL = `
SELECT
  (SELECT COUNT(*) FROM icon_orders WHERE status = 'new') AS new_orders,
  (SELECT COUNT(*) FROM icon_orders WHERE is_read = 0) AS unread_orders,
  (
    (SELECT COUNT(*) FROM church_icons WHERE status = 'draft') +
    (SELECT COUNT(*) FROM church_prayers WHERE status = 'draft') +
    (SELECT COUNT(*) FROM church_saints WHERE status = 'draft') +
    (SELECT COUNT(*) FROM church_gospel_readings WHERE status = 'draft') +
    (SELECT COUNT(*) FROM church_articles WHERE status = 'draft') +
    (SELECT COUNT(*) FROM church_calendar_days WHERE status = 'draft')
  ) AS drafts,
  (
    (SELECT COUNT(*) FROM church_icons WHERE status = 'published') +
    (SELECT COUNT(*) FROM church_prayers WHERE status = 'published') +
    (SELECT COUNT(*) FROM church_saints WHERE status = 'published') +
    (SELECT COUNT(*) FROM church_gospel_readings WHERE status = 'published') +
    (SELECT COUNT(*) FROM church_articles WHERE status = 'published') +
    (SELECT COUNT(*) FROM church_calendar_days WHERE status = 'published')
  ) AS published,
  (
    (SELECT COUNT(*) FROM (SELECT translation_group_id FROM church_icons GROUP BY translation_group_id HAVING COUNT(DISTINCT language) < 3)) +
    (SELECT COUNT(*) FROM (SELECT translation_group_id FROM church_saints GROUP BY translation_group_id HAVING COUNT(DISTINCT language) < 3)) +
    (SELECT COUNT(*) FROM (SELECT translation_group_id FROM church_calendar_days GROUP BY translation_group_id HAVING COUNT(DISTINCT language) < 3))
  ) AS missing_translations,
  (
    (SELECT COUNT(*) FROM church_icons WHERE image_url = '') +
    (SELECT COUNT(*) FROM church_saints WHERE image_url = '')
  ) AS missing_images,
  (SELECT COUNT(*) FROM church_prayers WHERE audio_url = '') AS prayers_without_audio
`;

const UPCOMING_DAYS_SQL = `
  SELECT id, title, date_new_style AS date, status
  FROM church_calendar_days
  WHERE language = 'uk' AND date_new_style >= ?
  ORDER BY date_new_style ASC
  LIMIT 5
`;

export async function getDashboardStats(now: string = new Date().toISOString()): Promise<DashboardStatsDto> {
  const today = now.slice(0, 10);
  const [aggregate, upcomingCalendarDays] = await Promise.all([
    d1First<AggregateRow>(AGGREGATE_SQL),
    d1All<UpcomingDayRow>(UPCOMING_DAYS_SQL, today),
  ]);

  return {
    newOrders: aggregate?.new_orders ?? 0,
    unreadOrders: aggregate?.unread_orders ?? 0,
    drafts: aggregate?.drafts ?? 0,
    published: aggregate?.published ?? 0,
    missingTranslations: aggregate?.missing_translations ?? 0,
    missingImages: aggregate?.missing_images ?? 0,
    prayersWithoutAudio: aggregate?.prayers_without_audio ?? 0,
    upcomingCalendarDays,
  };
}
