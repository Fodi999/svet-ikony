// @opennextjs/cloudflare's getCloudflareContext() types its `env` against
// the global `CloudflareEnv` interface (declared in its own
// cloudflare-context.d.ts). That's a different interface than wrangler
// types' generated `Env` (worker-configuration.d.ti, from `d1_databases` in
// wrangler.jsonc) — the two don't merge on their own, so the D1 binding and
// admin JWT secret are declared here too via the same interface-merging
// mechanism.
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    /** Set via `wrangler secret put` in production, `.dev.vars` locally —
     * never in wrangler.jsonc's plaintext `vars`. */
    ADMIN_JWT_SECRET?: string;
    JWT_SECRET?: string;
    /** Declared in wrangler.jsonc's `r2_buckets` (Stage 2D). Production
     * binds the real `svetikony-media` bucket; local `next dev` gets
     * Wrangler/Miniflare's own simulated local R2 storage automatically —
     * nothing here ever points at production unless `--remote` is passed,
     * which nothing in this project does. */
    MEDIA_BUCKET: R2Bucket;
    /** Telegram bot ("Світло Ікони"). Set via `wrangler secret put` in
     * production, `.dev.vars` locally — never in wrangler.jsonc's plaintext
     * `vars`. Optional: lib/telegram/env.ts treats an absent/blank token as
     * "bot disabled", not an error. */
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    /** Not sensitive — declared directly in wrangler.jsonc's `vars`. */
    TELEGRAM_CHANNEL?: string;
    /** Telegram autopost (OpenAI-generated). Secrets via `wrangler secret
     * put`, never in `vars`. Optional: lib/telegram/env.ts treats an
     * absent/blank OPENAI_API_KEY as "autopost disabled", not an error. */
    OPENAI_API_KEY?: string;
    /** Defaults to gpt-4o-mini (lib/ai/openai.ts) when unset. */
    OPENAI_MODEL?: string;
    /** Defaults to gpt-image-1 (lib/ai/openai-image.ts) when unset. */
    OPENAI_IMAGE_MODEL?: string;
    /** Shared secret the standalone cron pinger Worker (see cron/) sends as
     * X-Autopost-Secret — distinct from TELEGRAM_WEBHOOK_SECRET. */
    AUTOPOST_TICK_SECRET?: string;
  }
}

export {};
