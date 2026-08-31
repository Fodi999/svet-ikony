import { describe, expect, it } from 'vitest';
import { requiresCalendarVerification, validateBeforeSend } from './pre-send-validator';

describe('requiresCalendarVerification', () => {
  it('is true for saint_of_day', () => {
    expect(requiresCalendarVerification('saint_of_day')).toBe(true);
  });

  it('is false for morning_prayer, evening_prayer, gospel, and faith_story', () => {
    expect(requiresCalendarVerification('morning_prayer')).toBe(false);
    expect(requiresCalendarVerification('evening_prayer')).toBe(false);
    expect(requiresCalendarVerification('gospel')).toBe(false);
    expect(requiresCalendarVerification('faith_story')).toBe(false);
  });

  it('is false for a manually-composed post (contentType null)', () => {
    expect(requiresCalendarVerification(null)).toBe(false);
  });
});

describe('validateBeforeSend', () => {
  it('rejects when there is no text at all', () => {
    const result = validateBeforeSend({ contentType: null, verificationStatus: null, text: null });
    expect(result.ok).toBe(false);
  });

  it('allows a manually-composed post (no contentType) with text, regardless of verificationStatus', () => {
    const result = validateBeforeSend({ contentType: null, verificationStatus: null, text: 'Hello' });
    expect(result).toEqual({ ok: true });
  });

  it('allows morning_prayer with text even when verificationStatus was never set', () => {
    const result = validateBeforeSend({ contentType: 'morning_prayer', verificationStatus: null, text: 'Доброго ранку' });
    expect(result).toEqual({ ok: true });
  });

  it('rejects saint_of_day when verificationStatus is not "verified"', () => {
    expect(validateBeforeSend({ contentType: 'saint_of_day', verificationStatus: null, text: 'text' }).ok).toBe(false);
    expect(validateBeforeSend({ contentType: 'saint_of_day', verificationStatus: 'failed', text: 'text' }).ok).toBe(false);
  });

  it('allows saint_of_day only when verificationStatus is exactly "verified"', () => {
    const result = validateBeforeSend({ contentType: 'saint_of_day', verificationStatus: 'verified', text: 'text' });
    expect(result).toEqual({ ok: true });
  });
});
