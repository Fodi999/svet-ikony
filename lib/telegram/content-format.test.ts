import { describe, expect, it } from 'vitest';
import {
  AUTOPOST_GREETING_DEFAULT,
  AUTOPOST_GREETING_EVENING,
  AUTOPOST_SIGNATURE,
  CONTENT_TYPE_FORMAT_HINTS,
  CONTENT_TYPE_GREETINGS,
  CONTENT_TYPE_LINKED_CAPTIONS,
  CONTENT_TYPE_TARGET_LENGTH,
} from './content-format';

describe('CONTENT_TYPE_TARGET_LENGTH', () => {
  it('matches the specified ranges exactly', () => {
    expect(CONTENT_TYPE_TARGET_LENGTH).toEqual({
      morning_prayer: { min: 1200, max: 2200 },
      saint_of_day: { min: 1800, max: 3000 },
      gospel: { min: 2000, max: 3500 },
      faith_story: { min: 2500, max: 4000 },
      evening_prayer: { min: 1200, max: 2200 },
    });
  });
});

describe('CONTENT_TYPE_GREETINGS / CONTENT_TYPE_FORMAT_HINTS', () => {
  it('evening_prayer uses the moon greeting; every other type uses the default sun greeting', () => {
    expect(CONTENT_TYPE_GREETINGS.evening_prayer).toBe(AUTOPOST_GREETING_EVENING);
    expect(CONTENT_TYPE_GREETINGS.morning_prayer).toBe(AUTOPOST_GREETING_DEFAULT);
    expect(CONTENT_TYPE_GREETINGS.saint_of_day).toBe(AUTOPOST_GREETING_DEFAULT);
    expect(CONTENT_TYPE_GREETINGS.gospel).toBe(AUTOPOST_GREETING_DEFAULT);
    expect(CONTENT_TYPE_GREETINGS.faith_story).toBe(AUTOPOST_GREETING_DEFAULT);
  });

  it('every format hint names the correct greeting for its type', () => {
    for (const type of ['morning_prayer', 'saint_of_day', 'gospel', 'faith_story'] as const) {
      expect(CONTENT_TYPE_FORMAT_HINTS[type]).toContain(AUTOPOST_GREETING_DEFAULT);
    }
    expect(CONTENT_TYPE_FORMAT_HINTS.evening_prayer).toContain(AUTOPOST_GREETING_EVENING);
  });

  it('every format hint names the mandatory signature', () => {
    for (const hint of Object.values(CONTENT_TYPE_FORMAT_HINTS)) {
      expect(hint).toContain(AUTOPOST_SIGNATURE);
    }
  });

  it('saint_of_day\'s structure covers vita, teaching, thought-of-the-day, and prayer sections', () => {
    const hint = CONTENT_TYPE_FORMAT_HINTS.saint_of_day;
    expect(hint).toContain('життєпис');
    expect(hint).toContain('💭 Думка дня');
    expect(hint).toContain('🙏');
    expect(hint.toLowerCase()).toContain('перевірених фактів');
  });

  it('gospel\'s structure forbids presenting a paraphrase as a direct scripture quote', () => {
    const hint = CONTENT_TYPE_FORMAT_HINTS.gospel;
    expect(hint).toContain('📖 Євангеліє дня');
    expect(hint.toLowerCase()).toContain('не вигадуй цитат');
  });

  it('evening_prayer\'s structure allows -- but does not require -- mentioning verified saints', () => {
    const hint = CONTENT_TYPE_FORMAT_HINTS.evening_prayer;
    expect(hint).toContain('🙏 Вечірня молитва');
    expect(hint.toUpperCase()).toContain('ПЕРЕВІРЕНИХ');
  });
});

describe('CONTENT_TYPE_LINKED_CAPTIONS', () => {
  it('matches the exact required caption for every content type', () => {
    expect(CONTENT_TYPE_LINKED_CAPTIONS).toEqual({
      morning_prayer: '☀️ Ранкова молитва\n🙏 Продовження — у наступному повідомленні.',
      evening_prayer: '🌙 Вечірня молитва\n🙏 Продовження — у наступному повідомленні.',
      saint_of_day: '☀️ Святий дня\n☦️ Продовження — у наступному повідомленні.',
      gospel: '📖 Євангеліє дня\n☦️ Продовження — у наступному повідомленні.',
      faith_story: '☀️ Історія віри\n🙏 Продовження — у наступному повідомленні.',
    });
  });

  it('every caption points the reader to the next message, never repeating or summarizing the full text', () => {
    for (const caption of Object.values(CONTENT_TYPE_LINKED_CAPTIONS)) {
      expect(caption).toContain('Продовження');
      expect(caption).toContain('наступному повідомленні');
    }
  });
});
