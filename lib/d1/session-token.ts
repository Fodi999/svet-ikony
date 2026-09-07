/**
 * Opaque admin session tokens (Phase 1A) -- the literal X-Admin-Session
 * value the BFF sends, and the SHA-256 hash of it that's actually stored in
 * admin_sessions.token_hash. Deliberately not a JWT: see the Phase 1A
 * design report for why a DB-backed, revocable token is required here
 * (real logout, real "disabled account rejected immediately").
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 256 bits of randomness, base64url-encoded -- this is the raw value that
 * gets sent to the browser as the cookie / to svet-ikony as X-Admin-Session.
 * Never persisted anywhere; only its hash (see hashSessionToken) is stored. */
export function generateSessionToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 of the raw token, hex-encoded. Same principle as password
 * hashing: a stolen DB dump of admin_sessions must not yield a usable
 * session token. */
export async function hashSessionToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
