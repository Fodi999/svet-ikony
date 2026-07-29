import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listAlphabetLetters } from '@/lib/d1/repositories/alphabet';
import { isValidPreview } from '@/lib/church-public/preview';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/alphabet/:slug`, composing `PublicChurchAlphabetPage`
 * (just the letter + its translations — no icon/prayer/calendar relations
 * on this DTO).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const language = searchParams.get('language') ?? undefined;
    const preview = await isValidPreview(searchParams.get('preview_token'));

    const allLetters = await listAlphabetLetters({});
    const candidates = allLetters.filter((item) => item.slug === slug);
    const letter = (language ? candidates.find((item) => item.language === language) : undefined) ?? candidates[0];

    if (!letter || (letter.status !== 'published' && !preview)) {
      return Response.json(null);
    }

    const translations = allLetters
      .filter((item) => item.translationGroupId === letter.translationGroupId && item.language !== letter.language)
      .map((item) => ({ language: item.language, slug: item.slug, title: item.name }));

    return Response.json({ letter, translations });
  });
}
