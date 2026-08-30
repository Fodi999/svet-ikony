import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getTodayContentForAdmin } from '@/lib/telegram/admin-content';

/** Admin "Сьогодні" tab — the same source data the bot's /today command
 * uses, structured for the composer instead of pre-formatted as bot text. */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await getTodayContentForAdmin());
  });
}
