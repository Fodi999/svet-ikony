import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Build-time constant from `NEXT_PUBLIC_SITE_URL`, inlined into the JS
 * bundle by Next.js at `next build` time. ONLY safe for client-side code
 * (browser bundles legitimately need a build-time value; that's what
 * NEXT_PUBLIC_* is for) -- never use this server-side. A server-side use
 * bakes in whatever `.env.local` said on the machine that ran `npm run
 * build`/`npm run deploy`, regardless of which environment the resulting
 * Worker actually runs in -- this is exactly the bug that put
 * `http://localhost:3001` into a real production Telegram media_url.
 * Server-side code must use getSiteUrl()/absoluteSiteUrl() below instead.
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://svetikony.com').replace(/\/+$/, '');

/** Local dev fallback only -- matches .env.local's NEXT_PUBLIC_SITE_URL
 * convention (adjust the port there to match `npm run dev`). Never used in
 * production, where SITE_URL is always set (see `wrangler secret put
 * SITE_URL`). SITE_URL is deliberately set as a *secret*, not a
 * wrangler.jsonc `vars` entry, even though its value isn't sensitive --
 * `vars` is shared between local `--local` runs and the deployed Worker,
 * and this must never leak into local dev (which needs to keep
 * self-referencing its own localhost instance, not production -- see
 * lib/api.ts's internal `/api/church/**` fetches). */
const LOCAL_DEV_FALLBACK = 'http://localhost:3001';

/**
 * The canonical public site URL for everything server-side: R2 media links
 * that a third party (Telegram) must be able to fetch, admin media-listing
 * URLs, this Worker's own self-referencing `/api/church/**` fetches, and
 * canonical/OG URLs built in server components. Reads `SITE_URL` from the
 * Cloudflare Workers runtime (production: the real domain; local `next
 * dev`: usually unset, falling back to localhost) -- never
 * `NEXT_PUBLIC_SITE_URL`, which is a build-time client-bundle concern (see
 * `siteUrl` above).
 */
export async function getSiteUrl(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const configured = env.SITE_URL?.trim();
  return (configured || LOCAL_DEV_FALLBACK).replace(/\/+$/, '');
}

/** Server-side only -- see getSiteUrl() above. Client components (anything
 * marked 'use client') cannot call this (getCloudflareContext() doesn't
 * exist in the browser) and must use the `siteUrl` constant instead. */
export async function absoluteSiteUrl(path: string): Promise<string> {
  const base = await getSiteUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
