import { describe, expect, it } from 'vitest';
import { checkUkrainianLanguage, describeLanguageGuardFailure } from './language-guard';

describe('checkUkrainianLanguage', () => {
  // The real production incident: telegram_posts.id=19 (saint_of_day,
  // publish_date 2026-09-03, status 'sent', telegram_message_id=72) shipped
  // this exact sentence to the live Telegram channel.
  it('REJECTS the real incident text: an English phrase ("spread the Gospel") embedded in Ukrainian prose', () => {
    const text =
      "Він є одним із сімдесяти апостолів Христових, які spread the Gospel, несучи світло віри в різні куточки світу.";
    const result = checkUkrainianLanguage(text);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('latin_phrase');
    expect(describeLanguageGuardFailure(result)).toBe('Виявлено текст іншою мовою: "spread the"');
  });

  it('PASSES the corrected Ukrainian version of the same sentence', () => {
    const text =
      "Він є одним із сімдесяти апостолів Христових, які поширювали Євангеліє, несучи світло віри в різні куточки світу.";
    expect(checkUkrainianLanguage(text)).toEqual({ ok: true });
  });

  it('REJECTS a Russian-only-letter leak (ы/э/ъ/ё never appear in correct Ukrainian orthography)', () => {
    const result = checkUkrainianLanguage('Він є одним із сімдесяти апостолів, которые несли світло віри.');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('russian_letters');
  });

  it('REJECTS a full English sentence, not just a short phrase', () => {
    const result = checkUkrainianLanguage('Сьогодні ми згадуємо. This is a great day for the whole community to celebrate together.');
    expect(result.ok).toBe(false);
  });

  it('does not flag a single isolated Latin-script proper name/brand', () => {
    expect(checkUkrainianLanguage('Підписуйтеся на наш канал Telegram, щоб не пропустити оновлення.')).toEqual({ ok: true });
    expect(checkUkrainianLanguage('Публікацію підготовлено за допомогою OpenAI на основі перевірених фактів.')).toEqual({ ok: true });
  });

  it('does not flag a URL', () => {
    expect(checkUkrainianLanguage('Детальніше читайте на сайті https://svetikony.com/church/calendar сьогодні.')).toEqual({
      ok: true,
    });
  });

  it('does not flag an email address', () => {
    expect(checkUkrainianLanguage('Пишіть нам на пошту admin@svetikony.com з будь-якими питаннями.')).toEqual({ ok: true });
  });

  it('does not flag a hashtag or @-mention', () => {
    expect(checkUkrainianLanguage('Приєднуйтесь до нас у Telegram: @svit_ikony, там щодня нові публікації.')).toEqual({
      ok: true,
    });
  });

  it('does not flag plain punctuation, digits, or the mandatory signature', () => {
    expect(
      checkUkrainianLanguage('Сьогодні, 3 вересня 2026 року, ми молимося разом. ☦️ «Світло ікони»'),
    ).toEqual({ ok: true });
  });

  it('does not flag two Latin tokens that are not adjacent (a Ukrainian word breaks the run)', () => {
    expect(checkUkrainianLanguage('Іван Paul зустрів Petro у храмі.')).toEqual({ ok: true });
  });

  it('does not flag a single Latin letter or short acronym-like fragment', () => {
    expect(checkUkrainianLanguage('Розділ A, підпункт I -- короткий виклад.')).toEqual({ ok: true });
  });

  it('flags a phrase even when followed by punctuation directly (no trailing space before the comma)', () => {
    const result = checkUkrainianLanguage('Ми говоримо про holy spirit, і про віру.');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.evidence).toBe('holy spirit');
  });
});
