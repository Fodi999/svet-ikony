/**
 * Telegram login ticket generation (Phase 3). Same shape/principle as
 * lib/d1/session-token.ts's generateSessionToken/hashSessionToken: a raw,
 * high-entropy, single-use secret that is sent to the client and never
 * stored, plus a SHA-256 hash of it that IS stored and is all the exchange
 * endpoint ever looks up by. A stolen DB dump of
 * admin_telegram_login_requests must not yield a usable ticket.
 *
 * Deliberately NOT six digits (a 6-digit code is ~20 bits, brute-forceable
 * within a 2-minute TTL against an unrate-limited exchange endpoint) --
 * generateDisplayCode() below produces a SEPARATE 6-digit string purely for
 * human-readable diagnostics (e.g. showing in a support conversation "your
 * code was 482913"), which never itself authenticates anything -- the
 * exchange endpoint only ever accepts the raw 256-bit ticket.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 256 bits of randomness, base64url-encoded -- this is the raw value that
 * goes into the Telegram button URL's fragment and is exchanged by the
 * browser exactly once. Never persisted anywhere; only its hash (see
 * hashTicket) is stored. */
export function generateRawTicket(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 of the raw ticket, hex-encoded -- same digest/encoding as
 * hashSessionToken/hashRateLimitKey. */
export async function hashTicket(rawTicket: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawTicket));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A separate, non-authenticating 6-digit human-readable code -- diagnostics
 * only, see this module's own doc comment. Uses crypto.getRandomValues, not
 * Math.random, purely so it's not trivially predictable even though it
 * carries no security weight of its own. */
export function generateDisplayCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(bytes[0]! % 1_000_000).padStart(6, '0');
}
