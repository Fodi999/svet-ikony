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
