import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';
import { resolveRequestedLanguage, resolveTranslation } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/prayers/:slug`, composing `PublicChurchPrayerPage`.
 *
 * PHASE MULTILINGUAL-1 / P0.1: a request for a language this prayer has no
 * published row in returns `{prayer: null, translations: [...]}`, never a
 * different language's row silently relabeled as the requested one.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const languageResolution = resolveRequestedLanguage(searchParams);
    if (!languageResolution.ok) return languageResolution.response;
    const language = languageResolution.language;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allPrayers = await listPrayers({});
    const candidates = allPrayers.filter((item) => item.slug === slug);
    if (candidates.length === 0) return Response.json(null);

    const groupId = candidates[0].translationGroupId;
    const siblings = allPrayers.filter((item) => item.translationGroupId === groupId);
    const { match: prayer, published } = resolveTranslation(siblings, language, preview);

    if (published.length === 0) return Response.json(null);

    if (!prayer) {
      const translations = published.map((item) => ({ language: item.language, slug: item.slug, title: item.title }));
      return Response.json({ prayer: null, icon: null, calendarDay: null, translations });
    }

    const [icons, calendarDays] = await Promise.all([
      prayer.iconId ? listIcons({}) : Promise.resolve([]),
      prayer.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
    ]);

    const icon = prayer.iconId ? (icons.find((item) => item.id === prayer.iconId) ?? null) : null;
    const calendarDay = prayer.calendarDayId ? (calendarDays.find((day) => day.id === prayer.calendarDayId) ?? null) : null;
    const translations = published
      .filter((item) => item !== prayer)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.title }));

    return Response.json({ prayer, icon, calendarDay, translations });
  });
}
