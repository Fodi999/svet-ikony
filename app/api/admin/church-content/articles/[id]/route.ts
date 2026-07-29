import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { deleteArticle, getArticle, updateArticle, type ChurchArticlePayload } from '@/lib/d1/repositories/articles';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getArticle(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchArticlePayload;
    return Response.json(await updateArticle(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    await deleteArticle(id);
    return new Response(null, { status: 204 });
  });
}
