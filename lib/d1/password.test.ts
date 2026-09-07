import { describe, expect, it } from 'vitest';
import { CURRENT_PBKDF2_ITERATIONS, hashPassword, verifyPassword } from './password';

describe('hashPassword / verifyPassword', () => {
  it('round-trips: the password that was hashed verifies successfully', async () => {
    const hash = await hashPassword('correct horse battery staple');
    const result = await verifyPassword('correct horse battery staple', hash);
    expect(result.valid).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    const result = await verifyPassword('wrong password', hash);
    expect(result.valid).toBe(false);
  });

  it('produces a different hash for the same password on two calls (random salt)', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
  });

  it('two different salts still both verify their own password correctly', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect((await verifyPassword('same password', a)).valid).toBe(true);
    expect((await verifyPassword('same password', b)).valid).toBe(true);
  });

  it('stores a versioned, self-describing format: pbkdf2-sha256$<iterations>$<salt>$<hash>', async () => {
    const hash = await hashPassword('x');
    const parts = hash.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('pbkdf2-sha256');
    expect(Number(parts[1])).toBe(CURRENT_PBKDF2_ITERATIONS);
    expect(parts[2]!.length).toBeGreaterThan(0);
    expect(parts[3]!.length).toBeGreaterThan(0);
  });

  it('parses and verifies a hash stored with a lower (legacy) iteration count, and flags it for rehash', async () => {
    const legacyHash = await hashPassword('x', 100_000);
    const result = await verifyPassword('x', legacyHash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });

  it('does not flag a current-iteration hash for rehash', async () => {
    const hash = await hashPassword('x');
    const result = await verifyPassword('x', hash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it('never flags an invalid password as needing rehash', async () => {
    const legacyHash = await hashPassword('x', 100_000);
    const result = await verifyPassword('wrong', legacyHash);
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it('rejects a malformed stored value instead of throwing', async () => {
    await expect(verifyPassword('x', 'not-a-real-hash')).resolves.toEqual({ valid: false, needsRehash: false });
    await expect(verifyPassword('x', 'pbkdf2-sha256$abc$salt$hash')).resolves.toEqual({ valid: false, needsRehash: false });
    await expect(verifyPassword('x', 'bcrypt$10$salt$hash')).resolves.toEqual({ valid: false, needsRehash: false });
  });
});

/**
 * AUTH HOTFIX: this module's internal PBKDF2 execution moved from Web
 * Crypto (crypto.subtle.importKey/deriveBits) to node:crypto's pbkdf2 --
 * Cloudflare Workers' SubtleCrypto rejects any PBKDF2 iteration count above
 * 100,000 (`NotSupportedError`, confirmed via `wrangler tail` against real
 * production traffic), a cap Node's own SubtleCrypto never had, which is
 * why this went undetected by every test above until it hit production.
 * node:crypto's pbkdf2 has no such cap in either runtime. The public API
 * (hashPassword/verifyPassword/needsRehash semantics) and the stored
 * format are unchanged -- these tests exist specifically to prove that
 * claim, not just assert it.
 */
describe('AUTH HOTFIX -- node:crypto PBKDF2 implementation', () => {
  it('actually executes PBKDF2-SHA256 at the real 600,000 iteration count through the new implementation (not mocked, not reduced)', async () => {
    const hash = await hashPassword('a genuinely 600k-iteration password');
    const [, iterations] = hash.split('$');
    expect(Number(iterations)).toBe(600_000);
    expect(CURRENT_PBKDF2_ITERATIONS).toBe(600_000);

    const result = await verifyPassword('a genuinely 600k-iteration password', hash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it('a hash produced by the OLD Web Crypto implementation (crypto.subtle.deriveBits, byte-for-byte what the bootstrap CLI and production admin_users row actually contain) verifies successfully against the NEW node:crypto-based verifyPassword() -- the existing production hash does not need to change', async () => {
    const password = 'existing-production-admin-password';
    const iterations = 600_000;

    // Fixed (not random) salt so this fixture is fully deterministic and
    // reproducible -- a real stored hash's salt is random, but that's
    // orthogonal to what this test proves (algorithmic compatibility).
    const salt = new Uint8Array([3, 141, 59, 217, 88, 6, 233, 14, 75, 201, 19, 250, 132, 47, 168, 5]);

    // Independently replicates the OLD implementation this module used
    // before the hotfix -- deliberately NOT calling anything from ./password
    // here, so this is a real cross-implementation comparison, not a
    // tautology against the code under test.
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const oldBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
    const oldHashB64 = btoa(String.fromCharCode(...new Uint8Array(oldBits)));
    const saltB64 = btoa(String.fromCharCode(...salt));
    const oldStoredHash = `pbkdf2-sha256$${iterations}$${saltB64}$${oldHashB64}`;

    const result = await verifyPassword(password, oldStoredHash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it('the OLD-implementation fixture above rejects the wrong password (sanity check that the cross-compat test itself is meaningful, not vacuously true)', async () => {
    const password = 'existing-production-admin-password';
    const iterations = 600_000;
    const salt = new Uint8Array([3, 141, 59, 217, 88, 6, 233, 14, 75, 201, 19, 250, 132, 47, 168, 5]);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const oldBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
    const oldHashB64 = btoa(String.fromCharCode(...new Uint8Array(oldBits)));
    const saltB64 = btoa(String.fromCharCode(...salt));
    const oldStoredHash = `pbkdf2-sha256$${iterations}$${saltB64}$${oldHashB64}`;

    const result = await verifyPassword('a-completely-different-password', oldStoredHash);
    expect(result.valid).toBe(false);
  });
});
