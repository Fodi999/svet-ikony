import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { buildContentPlan } from '@/lib/telegram/content-plan';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 370;

function currentKyivYear(): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric' }).format(new Date()));
}

/**
 * Read-only year/range calendar for the admin "Контент-план" tab (task:
 * "TELEGRAM CONTENT PLAN — YEAR CALENDAR UI"). One aggregate payload for
 * the whole requested range instead of 365x5 separate requests -- see
 * lib/telegram/content-plan.ts. Never calls OpenAI, never touches
 * Telegram, never writes to D1 (claimAutopostSlot/markTelegramPostSent
 * etc. are not imported anywhere in this path).
 */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    let fromCivilDate: string;
    let toCivilDate: string;

    if (fromParam || toParam) {
      if (!fromParam || !toParam || !DATE_PATTERN.test(fromParam) || !DATE_PATTERN.test(toParam)) {
        throw ApiError.validation('from and to must both be YYYY-MM-DD');
      }
      if (fromParam > toParam) throw ApiError.validation('from must not be after to');
      fromCivilDate = fromParam;
      toCivilDate = toParam;
    } else {
      const year = yearParam ? Number(yearParam) : currentKyivYear();
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw ApiError.validation('year must be an integer between 2000 and 2100');
      }
      fromCivilDate = `${year}-01-01`;
      toCivilDate = `${year}-12-31`;
    }

    const rangeDays = (new Date(`${toCivilDate}T00:00:00Z`).getTime() - new Date(`${fromCivilDate}T00:00:00Z`).getTime()) / 86400000 + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw ApiError.validation(`requested range is too large (max ${MAX_RANGE_DAYS} days)`);
    }

    return Response.json(await buildContentPlan(fromCivilDate, toCivilDate));
  });
}
