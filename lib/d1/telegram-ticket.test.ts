import { describe, expect, it } from 'vitest';
import { generateDisplayCode, generateRawTicket, hashTicket } from './telegram-ticket';

describe('telegram-ticket', () => {
  it('generateRawTicket produces at least 256 bits of randomness (32 raw bytes, base64url-encoded)', () => {
    const ticket = generateRawTicket();
    // base64url of 32 bytes is 43 chars (no padding) -- confirms the real
    // byte length going in, not just a long-looking string.
    expect(ticket.length).toBe(43);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('two calls never produce the same raw ticket', () => {
    const a = generateRawTicket();
    const b = generateRawTicket();
    expect(a).not.toBe(b);
  });

  it('is not a 6-digit code', () => {
    const ticket = generateRawTicket();
    expect(ticket).not.toMatch(/^\d{6}$/);
  });

  it('hashTicket is deterministic and produces a 64-char hex SHA-256 digest', async () => {
    const ticket = generateRawTicket();
    const a = await hashTicket(ticket);
    const b = await hashTicket(ticket);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different tickets hash to different values', async () => {
    const a = await hashTicket(generateRawTicket());
    const b = await hashTicket(generateRawTicket());
    expect(a).not.toBe(b);
  });

  it('generateDisplayCode produces a 6-digit string, never itself the raw ticket', () => {
    const code = generateDisplayCode();
    expect(code).toMatch(/^\d{6}$/);
  });
});
