/**
 * Password hashing for admin_users.password_hash (Phase 1A). PBKDF2-HMAC-
 * SHA256 via node:crypto rather than a bcrypt/argon2 dependency -- needs
 * zero new dependency, and node:crypto is available in Cloudflare Workers
 * under the `nodejs_compat` flag this project already sets (wrangler.jsonc).
 *
 * PRODUCTION HOTFIX (AUTH HOTFIX phase): this originally used Web Crypto
 * (crypto.subtle.importKey/deriveBits), matching lib/d1/auth.ts's/
 * session-token.ts's own "hand-rolled via Web Crypto rather than pulling in
 * a library" convention for THEIR algorithms (HMAC sign/verify, SHA-256
 * digest -- both still Web Crypto, both unaffected by this issue, since
 * neither takes an iteration count). PBKDF2 specifically hit a real
 * Cloudflare Workers runtime limit that no local/Node test caught:
 * `crypto.subtle.deriveBits({name:"PBKDF2", iterations})` in the Workers
 * runtime throws `NotSupportedError: Pbkdf2 failed: iteration counts above
 * 100000 are not supported` -- confirmed via `wrangler tail` against real
 * production traffic hitting POST /api/admin/auth/login. Node's own
 * SubtleCrypto has no such cap, which is exactly why this passed every
 * existing test and only broke in the deployed Worker. node:crypto's
 * `pbkdf2` has no iteration ceiling in either runtime, so switching only
 * this one internal function's implementation (never the stored format,
 * never the public hashPassword/verifyPassword API) keeps
 * CURRENT_PBKDF2_ITERATIONS at the real OWASP-recommended 600,000 while
 * actually running in production. See lib/d1/password.test.ts's
 * "AUTH HOTFIX" describe block for the direct proof that hashes the OLD
 * Web-Crypto implementation produced still verify correctly against this
 * new implementation -- the already-provisioned production admin row's
 * hash does not need to change.
 *
 * Iteration count: 600,000, the current OWASP Password Storage Cheat Sheet
 * recommendation for PBKDF2-HMAC-SHA256. Login is a deliberate, infrequent,
 * user-initiated action, not a hot per-request path, so this cost is
 * acceptable.
 *
 * Stored format is versioned and self-describing so raising the iteration
 * count later never requires a mass password reset:
 *
 *   pbkdf2-sha256$<iterations>$<salt-base64>$<hash-base64>
 *
 * verifyPassword() reads the iteration count from the hash string itself
 * (never a hardcoded global), and reports whether that count is below the
 * current target so a caller can transparently rehash-and-store on a
 * successful login -- see needsRehash().
 */

import { pbkdf2 as nodePbkdf2 } from 'node:crypto';

export const CURRENT_PBKDF2_ITERATIONS = 600_000;
const ALGORITHM_TAG = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const HASH_BITS = 256;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    nodePbkdf2(password, salt, iterations, HASH_BITS / 8, 'sha256', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Constant-time byte comparison -- verifyPassword must not leak timing
 * information about how much of the hash matched. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string, iterations: number = CURRENT_PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(password, salt, iterations);
  return `${ALGORITHM_TAG}$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}

export type VerifyPasswordResult = {
  valid: boolean;
  /** True when the stored hash used fewer than CURRENT_PBKDF2_ITERATIONS --
   * the caller should rehash and persist the new hash on a successful
   * login. Always false when valid is false (nothing to upgrade). */
  needsRehash: boolean;
};

export async function verifyPassword(password: string, stored: string): Promise<VerifyPasswordResult> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== ALGORITHM_TAG) {
    return { valid: false, needsRehash: false };
  }
  const [, iterationsRaw, saltB64, hashB64] = parts;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return { valid: false, needsRehash: false };
  }

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64ToBytes(saltB64!);
    expected = base64ToBytes(hashB64!);
  } catch {
    return { valid: false, needsRehash: false };
  }

  const actual = await pbkdf2(password, salt, iterations);
  const valid = timingSafeEqual(actual, expected);
  return { valid, needsRehash: valid && iterations < CURRENT_PBKDF2_ITERATIONS };
}
