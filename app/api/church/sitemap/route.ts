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

    const items = [
      ...days
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'calendar' as const, slug: item.id, date: item.dateNewStyle || item.dateOldStyle || null, updatedAt: item.updatedAt })),
      ...icons
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'icon' as const, slug: item.slug, updatedAt: item.updatedAt })),
      ...prayers
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'prayer' as const, slug: item.slug, updatedAt: item.updatedAt })),
      ...articles
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'article' as const, slug: item.slug, updatedAt: item.updatedAt })),
      ...gospel
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'gospel' as const, slug: item.slug, updatedAt: item.updatedAt })),
      ...saints
        .filter((item) => item.status === 'published')
        .map((item) => ({ kind: 'saint' as const, slug: item.slug, updatedAt: item.updatedAt })),
    ];

    return Response.json(items);
  });
}
