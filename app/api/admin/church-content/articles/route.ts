import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createArticle, listArticles, type ChurchArticlePayload } from '@/lib/d1/repositories/articles';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const articles = await listArticles({
      calendarDayId: searchParams.get('calendarDayId') ?? undefined,
      iconId: searchParams.get('iconId') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    });
    return Response.json(articles);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchArticlePayload;
    const article = await createArticle(payload);
    return Response.json(article, { status: 201 });
  });
}
