import { withErrors } from '@/lib/d1/errors';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listArticles } from '@/lib/d1/repositories/articles';
import { listGospel } from '@/lib/d1/repositories/gospel';
import { listSaints } from '@/lib/d1/repositories/saints';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/sitemap`, composing `PublicChurchSitemapItem[]` — only
 * published items, matching what a sitemap should ever list.
 */
export async function GET() {
  return withErrors(async () => {
    const [days, icons, prayers, articles, gospel, saints] = await Promise.all([
      listCalendarDays({}),
      listIcons({}),
      listPrayers({}),
      listArticles({}),
      listGospel({}),
      listSaints({}),
    ]);

    // PHASE MULTILINGUAL-1 / P0.7: `language` is included per item so
    // app/sitemap.ts can advertise exactly the one locale each row is
    // actually published in, instead of assuming every row exists in all
    // 3 languages (it doesn't -- e.g. calendar/article/gospel currently
    // only have uk rows at all).
    const items = [
      ...days
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'calendar' as const, slug: item.id, date: item.dateNewStyle || item.dateOldStyle || null, updatedAt: item.updatedAt, language: item.language })),
      ...icons
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'icon' as const, slug: item.slug, updatedAt: item.updatedAt, language: item.language })),
      ...prayers
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'prayer' as const, slug: item.slug, updatedAt: item.updatedAt, language: item.language })),
      ...articles
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'article' as const, slug: item.slug, updatedAt: item.updatedAt, language: item.language })),
      ...gospel
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'gospel' as const, slug: item.slug, updatedAt: item.updatedAt, language: item.language })),
      ...saints
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'saint' as const, slug: item.slug, updatedAt: item.updatedAt, language: item.language })),
    ];

    return Response.json(items);
  });
}
