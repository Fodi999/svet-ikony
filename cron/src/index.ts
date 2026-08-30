/**
 * Standalone Cloudflare Worker whose only job is to own the Cron Trigger
 * and ping one authenticated endpoint in the main svet-ikony app on a
 * 5-minute cadence — see the plan doc for why this has to be a separate
 * Worker: the main app is built by @opennextjs/cloudflare, whose generated
 * output only ever exports a `fetch` handler, with no supported way to add
 * a `scheduled()` export.
 *
 * No D1, no Telegram, no OpenAI, nothing to duplicate or drift out of sync
 * with the real logic in lib/telegram/autopost.ts — this file has exactly
 * one job and deliberately knows nothing else.
 */

export interface Env {
  TICK_URL: string;
  /** Set via `wrangler secret put AUTOPOST_TICK_SECRET` — must match the
   * same-named secret on the main svet-ikony Worker exactly. */
  AUTOPOST_TICK_SECRET: string;
}

interface MinimalExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async scheduled(_event: unknown, env: Env, ctx: MinimalExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetch(env.TICK_URL, {
        method: 'POST',
        headers: { 'X-Autopost-Secret': env.AUTOPOST_TICK_SECRET },
      })
        .then((response) => {
          if (!response.ok) {
            console.error(`Autopost tick request failed: HTTP ${response.status}`);
          }
        })
        .catch((error: unknown) => {
          console.error('Autopost tick request threw', error);
        }),
    );
  },
};
