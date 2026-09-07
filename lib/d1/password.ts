/**
 * Password hashing for admin_users.password_hash (Phase 1A). Hand-rolled via
 * Web Crypto (PBKDF2-HMAC-SHA256, crypto.subtle.importKey/deriveBits) rather
 * than a bcrypt/argon2 dependency -- SubtleCrypto is a standard Cloudflare
 * Workers API (unlike bcrypt, which needs native bindings Workers doesn't
 * support) and needs zero new dependency, matching lib/d1/auth.ts's own
 * "hand-rolled via Web Crypto rather than pulling in a library for one
 * algorithm" convention. Runs identically in Node (used by tests and the
 * bootstrap CLI, both import this module directly) and in Workers.
 *
 * Iteration count: 600,000, the current OWASP Password Storage Cheat Sheet
 * recommendation for PBKDF2-HMAC-SHA256. Benchmarked empirically against
 * this Node runtime's native SubtleCrypto: ~44ms for 600,000 iterations
 * (100k ~11ms, 310k ~26ms) -- Workers' SubtleCrypto is the same class of
 * native, non-JS-polyfilled implementation, so this is a reasonable proxy,
 * though not a guaranteed-identical measurement; worth a real Workers-
 * environment timing check before production rollout. Login is a
 * deliberate, infrequent, user-initiated action, not a hot per-request
 * path, so this cost is acceptable.
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

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
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
