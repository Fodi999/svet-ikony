import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { prepareCalendarDate } from '@/lib/church/calendar-date-preparation';

export async function POST(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await prepareCalendarDate(await request.json()));
  });
}
