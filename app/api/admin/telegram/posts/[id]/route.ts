import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { getTelegramPost, updateTelegramPost, type TelegramPostUpdateInput } from '@/lib/d1/repositories/telegram';

function parsePostId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw ApiError.validation('id must be an integer');
  return id;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getTelegramPost(parsePostId(id)));
  });
}

/** Rejects with 409 if the post has already been sent — see
 * updateTelegramPost's doc comment. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = (await request.json()) as TelegramPostUpdateInput;
    return Response.json(await updateTelegramPost(parsePostId(id), payload));
  });
}
