import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { buildSourceCoverageReport } from '@/lib/telegram/source-coverage';

const DEFAULT_DAYS = 7;
const MAX_DAYS = 31;

/**
 * Read-only "will each daily slot actually have real D1 data?" preview
 * (task: "source availability coverage") -- never calls OpenAI or
 * Telegram, never writes anything, and never invents data: a day/type with
 * no matching D1 row is reported as MISSING for a human to fix before
 * autonomous mode relies on it. See lib/telegram/source-coverage.ts.
 */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const url = new URL(request.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Number(daysParam) : DEFAULT_DAYS;
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw ApiError.validation(`days must be an integer between 1 and ${MAX_DAYS}`);
    }

    return Response.json(await buildSourceCoverageReport(days));
  });
}
