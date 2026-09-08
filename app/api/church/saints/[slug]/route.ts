import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listSaints } from '@/lib/d1/repositories/saints';
import { listIcons } from '@/lib/d1/repositories/icons';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { isValidPreview } from '@/lib/church-public/preview';
import { resolveRequestedLanguage, resolveTranslation } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/saints/:slug`, composing `PublicChurchSaintPage`.
 *
 * PHASE MULTILINGUAL-1 / P0.1: a request for a language this saint has no
 * published row in returns `{saint: null, translations: [...]}`, never a
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

    const allSaints = await listSaints({});
    const candidates = allSaints.filter((item) => item.slug === slug);
    if (candidates.length === 0) return Response.json(null);

    const groupId = candidates[0].translationGroupId;
    const siblings = allSaints.filter((item) => item.translationGroupId === groupId);
    const { match: saint, published } = resolveTranslation(siblings, language, preview);

    if (published.length === 0) return Response.json(null);

    if (!saint) {
      const translations = published.map((item) => ({ language: item.language, slug: item.slug, title: item.name }));
      return Response.json({ saint: null, icon: null, calendarDay: null, prayers: [], translations });
    }

    const [icons, calendarDays, prayers] = await Promise.all([
      saint.iconId ? listIcons({}) : Promise.resolve([]),
      saint.calendarDayId ? listCalendarDays({}) : Promise.resolve([]),
      listPrayers({}),
    ]);

    const icon = saint.iconId ? (icons.find((item) => item.id === saint.iconId) ?? null) : null;
    const calendarDay = saint.calendarDayId ? (calendarDays.find((day) => day.id === saint.calendarDayId) ?? null) : null;
    const relatedPrayers = icon ? prayers.filter((prayer) => prayer.iconId === icon.id) : [];
    const translations = published
      .filter((item) => item !== saint)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.name }));

    return Response.json({ saint, icon, calendarDay, prayers: relatedPrayers, translations });
  });
}
