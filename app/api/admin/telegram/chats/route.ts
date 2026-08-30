import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { listTelegramChats } from '@/lib/d1/repositories/telegram';

/** Admin "Аудиторія" tab, read-only — no create/update/delete. */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await listTelegramChats());
  });
}
