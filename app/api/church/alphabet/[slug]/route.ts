import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listAlphabetLetters } from '@/lib/d1/repositories/alphabet';
import { isValidPreview } from '@/lib/church-public/preview';
import { resolveRequestedLanguage, resolveTranslation } from '@/lib/church-public/translation-fallback';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/alphabet/:slug`, composing `PublicChurchAlphabetPage`
 * (just the letter + its translations — no icon/prayer/calendar relations
 * on this DTO).
 *
 * PHASE MULTILINGUAL-1 / P0.1: a request for a language this letter has no
 * published row in returns `{letter: null, translations: [...]}`, never a
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

    const allLetters = await listAlphabetLetters({});
    const candidates = allLetters.filter((item) => item.slug === slug);
    if (candidates.length === 0) return Response.json(null);

    const groupId = candidates[0].translationGroupId;
    const siblings = allLetters.filter((item) => item.translationGroupId === groupId);
    const { match: letter, published } = resolveTranslation(siblings, language, preview);

    if (published.length === 0) return Response.json(null);

    if (!letter) {
      const translations = published.map((item) => ({ language: item.language, slug: item.slug, title: item.name }));
      return Response.json({ letter: null, translations });
    }

    const translations = published
      .filter((item) => item !== letter)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.name }));

    return Response.json({ letter, translations });
  });
}
