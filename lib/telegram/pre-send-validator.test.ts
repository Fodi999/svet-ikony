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

  // Task: "Найден production content-quality bug" -- the real telegram_
  // posts.id=19 text (saint_of_day, 2026-09-03) would have been caught here
  // had this check existed at the time; it's now the shared backstop gate
  // (see this function's own doc comment) for every send/ready path.
  describe('language guard', () => {
    it('rejects text with an embedded English phrase, regardless of calendar verification passing', () => {
      const result = validateBeforeSend({
        contentType: 'saint_of_day',
        verificationStatus: 'verified',
        text: 'Він є одним із сімдесяти апостолів Христових, які spread the Gospel, несучи світло віри в різні куточки світу.',
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.reason).toContain('Виявлено текст іншою мовою');
      expect(result.reason).toContain('latin_phrase');
    });

    it('allows the corrected Ukrainian version of the same text', () => {
      const result = validateBeforeSend({
        contentType: 'saint_of_day',
        verificationStatus: 'verified',
        text: 'Він є одним із сімдесяти апостолів Христових, які поширювали Євангеліє, несучи світло віри в різні куточки світу.',
      });
      expect(result).toEqual({ ok: true });
    });

    it('rejects a manually-composed post (no calendar verification requirement) with a language leak too', () => {
      const result = validateBeforeSend({ contentType: null, verificationStatus: null, text: 'Доброго ранку, have a nice day.' });
      expect(result.ok).toBe(false);
    });

    it('rejects a Russian-letter leak the same way', () => {
      const result = validateBeforeSend({
        contentType: 'morning_prayer',
        verificationStatus: null,
        text: 'Доброго ранку, которые моляться разом з нами.',
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.reason).toContain('russian_letters');
    });
  });
});
