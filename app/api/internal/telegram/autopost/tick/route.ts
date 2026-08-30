import { withErrors } from '@/lib/d1/errors';
import { runAutopostTick } from '@/lib/telegram/autopost';
import { getAutopostTickSecret } from '@/lib/telegram/env';

/**
 * POST /api/internal/telegram/autopost/tick — called only by the standalone
 * cron pinger Worker (see cron/), on a 5-minute cadence. Machine-to-machine
 * auth via `X-Autopost-Secret`, deliberately NOT `requireSuperAdmin` — there
 * is no admin session here, same trust-boundary shape as the Telegram
 * webhook's own secret header (app/api/telegram/webhook/route.ts).
 *
 * Always returns 200 with a JSON summary once authenticated, even when
 * nothing was due or autopost is globally off — a "no-op tick" is the
 * expected common case, not an error.
 */
export async function POST(request: Request) {
  const expected = await getAutopostTickSecret();
  const received = request.headers.get('x-autopost-secret');
  if (!expected || !received || received !== expected) {
    return new Response(null, { status: 401 });
  }

  return withErrors(async () => Response.json(await runAutopostTick()));
}
