/**
 * Shared helpers for the earth:* CLI scripts (publish.mjs, rollback.mjs).
 * Kept intentionally tiny -- both scripts are plain Node ESM with no
 * bundler/path-alias resolution (same convention as
 * scripts/visualizer/smoke.mjs), so this is a plain relative import, not a
 * new package.
 */
import { createHmac } from 'node:crypto';

const base64url = (value) => Buffer.from(value).toString('base64url');

/**
 * Self-signs a short-lived super_admin JWT -- the exact same shape
 * lib/d1/auth.ts's verifyAdminToken() expects (HS256, {sub, role, iat,
 * exp}), and the exact same pattern scripts/visualizer/smoke.mjs already
 * uses. These CLIs are just another trusted backend caller of svet-ikony's
 * own /api/admin/** surface, same as the existing admin BFF -- the secret
 * comes only from the process environment, never from a file either
 * script writes or reads.
 */
export function mintAdminToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ sub: 'earth-cli', role: 'super_admin', iat: now, exp: now + 300 }))}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

/** Reads ADMIN_JWT_SECRET (falls back to JWT_SECRET, mirroring
 * lib/d1/env.ts's getAdminJwtSecret()) from the environment. Throws a
 * plain Error rather than exiting directly -- callers that support --json
 * output (publish.mjs) need this to flow through their own top-level
 * catch so a missing secret still produces a well-formed JSON report, not
 * just plain-text stderr. Callers without --json (rollback.mjs) get the
 * exact same message via their own catch-and-exit. Must never be
 * satisfied by reading a file. */
export function requireAdminSecret() {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Потрібна змінна оточення ADMIN_JWT_SECRET (або JWT_SECRET). Ніколи не зберігайте її у файлах репозиторію.');
  }
  return secret;
}

/** Reads --site-url/$SITE_URL. Throws (see requireAdminSecret's doc
 * comment for why) if neither is set -- a run must never silently guess
 * production. */
export function requireSiteUrl(siteUrl) {
  if (!siteUrl) {
    throw new Error('Потрібен --site-url або $SITE_URL -- публікація/rollback ніколи не вгадує production неявно.');
  }
  return siteUrl.replace(/\/+$/, '');
}

/** Thin fetch wrapper: adds the Bearer token, JSON-encodes a plain object
 * body (leaves FormData alone), and turns any non-2xx response into a
 * thrown Error with the server's own message when available. */
export async function apiCall(siteUrl, token, requestPath, method, body) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(new URL(requestPath, siteUrl), {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body, fall through */ }
  if (!response.ok) {
    throw new Error(`${method} ${requestPath} -> ${response.status}: ${json?.message || text.slice(0, 300)}`);
  }
  return json;
}
