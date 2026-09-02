import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mockListCalendarDays = vi.fn();
vi.mock('@/lib/d1/repositories/calendarDays', () => ({ listCalendarDays: mockListCalendarDays }));

const mockListSaints = vi.fn();
vi.mock('@/lib/d1/repositories/saints', () => ({ listSaints: mockListSaints }));

const mockListGospel = vi.fn();
vi.mock('@/lib/d1/repositories/gospel', () => ({ listGospel: mockListGospel }));

const mockListPrayers = vi.fn();
vi.mock('@/lib/d1/repositories/prayers', () => ({ listPrayers: mockListPrayers }));

const mockListArticles = vi.fn();
vi.mock('@/lib/d1/repositories/articles', () => ({ listArticles: mockListArticles }));

const mockListTelegramPosts = vi.fn();
vi.mock('@/lib/d1/repositories/telegram', () => ({ listTelegramPosts: mockListTelegramPosts }));

const mockGetAutopostSettings = vi.fn();
vi.mock('@/lib/d1/repositories/telegram-autopost', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/d1/repositories/telegram-autopost')>('@/lib/d1/repositories/telegram-autopost');
  return { ...actual, getAutopostSettings: mockGetAutopostSettings };
});

const { buildContentPlan, buildContentPlanDayDetail } = await import('./content-plan');

const SCHEDULE = {
  globalEnabled: true,
  items: [
    { contentType: 'morning_prayer', enabled: true, scheduleTime: '07:00' },
    { contentType: 'saint_of_day', enabled: true, scheduleTime: '10:00' },
    { contentType: 'gospel', enabled: true, scheduleTime: '13:00' },
    { contentType: 'faith_story', enabled: true, scheduleTime: '17:00' },
    { contentType: 'evening_prayer', enabled: true, scheduleTime: '20:00' },
  ],
};

function resetDefaults() {
  vi.clearAllMocks();
  mockListCalendarDays.mockResolvedValue([]);
  mockListSaints.mockResolvedValue([]);
  mockListGospel.mockResolvedValue([]);
  mockListPrayers.mockResolvedValue([]);
  mockListArticles.mockResolvedValue([]);
  mockListTelegramPosts.mockResolvedValue([]);
  mockGetAutopostSettings.mockResolvedValue(SCHEDULE);
}

describe('buildContentPlan', () => {
  it('returns every civil day in the requested range, including days with zero D1 data (virtual empty day)', async () => {
    resetDefaults();

    const report = await buildContentPlan('2026-09-01', '2026-09-03');

    expect(report.days).toHaveLength(3);
    expect(report.days.map((d) => d.civilDate)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    for (const day of report.days) {
      expect(day.calendarTitle).toBeNull();
      for (const slot of Object.values(day.slots)) {
        expect(slot.sourceStatus).toBe('missing_source');
        expect(slot.publicationStatus).toBe('MISSING_SOURCE');
      }
    }
  });

  it('computes the Julian date via the real production conversion helper, never a hardcoded offset', async () => {
    resetDefaults();

    const report = await buildContentPlan('2026-08-31', '2026-08-31');

    // Civil 2026-08-31 (Europe/Kyiv) is Julian 2026-08-18 -- see julian-calendar.test.ts.
    expect(report.days[0].julianDate).toBe('2026-08-18');
  });

  it('maps a day with real D1 content to available/SOURCE_READY for every non-verification-required slot', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([
      { id: 'day-1', dateOldStyle: '2026-08-17', title: 'Мученики Флор і Лавр' }, // civil 2026-08-30's Julian date, arbitrary content-free test date
    ]);
    mockListGospel.mockResolvedValue([{ calendarDayId: 'day-1', text: 'Євангельський текст' }]);
    mockListPrayers.mockResolvedValue([
      { calendarDayId: 'day-1', prayerType: 'morning', text: 'Ранкова молитва', imageUrl: '' },
      { calendarDayId: 'day-1', prayerType: 'evening', text: 'Вечірня молитва', imageUrl: '' },
    ]);
    mockListArticles.mockResolvedValue([{ calendarDayId: 'day-1', content: 'Історія' }]);

    const report = await buildContentPlan('2026-08-30', '2026-08-30');
    const slots = report.days[0].slots;

    expect(slots.gospel.sourceStatus).toBe('available');
    expect(slots.gospel.publicationStatus).toBe('SOURCE_READY');
    expect(slots.morning_prayer.publicationStatus).toBe('SOURCE_READY');
    expect(slots.evening_prayer.publicationStatus).toBe('SOURCE_READY');
    expect(slots.faith_story.publicationStatus).toBe('SOURCE_READY');
    expect(slots.gospel.textAvailable).toBe(true);
  });

  it('marks saint_of_day SOURCE_READY when the D1 candidate matches the real two-source verified dataset', async () => {
    resetDefaults();
    // Civil 2026-08-31 -> Julian 2026-08-18, which orthodox-calendar-sources.ts
    // genuinely verifies as "Флор і Лавр" (see that file + autopost.test.ts).
    mockListCalendarDays.mockResolvedValue([{ id: 'day-flor', dateOldStyle: '2026-08-18', title: 'Мученики Флор і Лавр' }]);
    mockListSaints.mockResolvedValue([{ calendarDayId: 'day-flor', name: 'Мученики Флор і Лавр', imageUrl: '' }]);

    const report = await buildContentPlan('2026-08-31', '2026-08-31');
    const slot = report.days[0].slots.saint_of_day;

    expect(slot.verificationStatus).toBe('verified');
    expect(slot.publicationStatus).toBe('SOURCE_READY');
  });

  it('marks saint_of_day REVIEW_REQUIRED when D1 has a candidate but no two-source consensus exists for that date', async () => {
    resetDefaults();
    // 2026-01-01 civil has no entry at all in orthodox-calendar-sources.ts.
    mockListCalendarDays.mockResolvedValue([{ id: 'day-x', dateOldStyle: '2025-12-19', title: 'Невідомий святий' }]);
    mockListSaints.mockResolvedValue([{ calendarDayId: 'day-x', name: 'Невідомий святий', imageUrl: '' }]);

    const report = await buildContentPlan('2026-01-01', '2026-01-01');
    const slot = report.days[0].slots.saint_of_day;

    expect(slot.verificationStatus).toBe('failed');
    expect(slot.publicationStatus).toBe('REVIEW_REQUIRED');
  });

  it('maps a sent telegram_posts row to SENT with telegramMessageId/sentAt populated', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListGospel.mockResolvedValue([{ calendarDayId: 'day-1', text: 'Текст' }]);
    mockListTelegramPosts.mockResolvedValue([
      {
        publishDate: '2026-08-30',
        contentType: 'gospel',
        status: 'sent',
        text: 'Опублікований текст',
        mediaUrl: 'https://svetikony.com/media/x.png',
        telegramMessageId: 555,
        sentAt: '2026-08-30T13:00:00Z',
        verificationStatus: null,
        errorMessage: null,
      },
    ]);

    const report = await buildContentPlan('2026-08-30', '2026-08-30');
    const slot = report.days[0].slots.gospel;

    expect(slot.publicationStatus).toBe('SENT');
    expect(slot.telegramMessageId).toBe(555);
    expect(slot.sentAt).toBe('2026-08-30T13:00:00Z');
    expect(slot.imageAvailable).toBe(true);
  });

  it('maps a failed telegram_posts row with a failed verification to REVIEW_REQUIRED, and a plain failure to FAILED', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListTelegramPosts.mockResolvedValue([
      {
        publishDate: '2026-08-30',
        contentType: 'saint_of_day',
        status: 'failed',
        verificationStatus: 'failed',
        text: null,
        mediaUrl: null,
        telegramMessageId: null,
        sentAt: null,
        errorMessage: 'Calendar verification failed',
      },
      {
        publishDate: '2026-08-30',
        contentType: 'gospel',
        status: 'failed',
        verificationStatus: null,
        text: null,
        mediaUrl: null,
        telegramMessageId: null,
        sentAt: null,
        errorMessage: 'Telegram API error',
      },
    ]);

    const report = await buildContentPlan('2026-08-30', '2026-08-30');

    expect(report.days[0].slots.saint_of_day.publicationStatus).toBe('REVIEW_REQUIRED');
    expect(report.days[0].slots.gospel.publicationStatus).toBe('FAILED');
    expect(report.days[0].slots.gospel.errorMessage).toBe('Telegram API error');
  });

  it('never includes text previews or image URLs in the bulk list (kept light for a full-year payload)', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListGospel.mockResolvedValue([{ calendarDayId: 'day-1', text: 'A'.repeat(500) }]);

    const report = await buildContentPlan('2026-08-30', '2026-08-30');

    expect(report.days[0].slots.gospel.textPreview).toBeUndefined();
    expect(report.days[0].slots.gospel.imageUrl).toBeUndefined();
  });

  it('computes summary counts from the actual per-slot statuses, never hardcoded', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListGospel.mockResolvedValue([{ calendarDayId: 'day-1', text: 'Текст' }]);

    const report = await buildContentPlan('2026-08-30', '2026-08-30');

    expect(report.summary.totalDays).toBe(1);
    expect(report.summary.sourceReady).toBe(1); // gospel
    expect(report.summary.missingSource).toBe(4); // the other 4 slots
    expect(report.summary.coverage.gospel).toEqual({ available: 1, missing: 0 });
    expect(report.summary.coverage.morning_prayer).toEqual({ available: 0, missing: 1 });
  });

  it('fetches every repository exactly once regardless of the range length (bulk, not per-day, queries)', async () => {
    resetDefaults();

    await buildContentPlan('2026-09-01', '2026-09-30');

    expect(mockListCalendarDays).toHaveBeenCalledTimes(1);
    expect(mockListSaints).toHaveBeenCalledTimes(1);
    expect(mockListGospel).toHaveBeenCalledTimes(1);
    expect(mockListPrayers).toHaveBeenCalledTimes(1);
    expect(mockListArticles).toHaveBeenCalledTimes(1);
    expect(mockListTelegramPosts).toHaveBeenCalledTimes(1);
  });

  it('never imports the Telegram client, OpenAI text generator, or any D1 write path -- read-only by construction', () => {
    const source = readFileSync(join(__dirname, 'content-plan.ts'), 'utf8');
    // Check only the actual `import ... from '...'` statements, not this
    // module's own doc comments (which name these symbols to explain why
    // they're deliberately absent).
    const importLines = source
      .split('\n')
      .filter((line) => /^import /.test(line))
      .join('\n');

    expect(importLines).not.toMatch(/TelegramClient|generateTelegramPost|claimAutopostSlot|markTelegramPostSent|markTelegramPostFailed|setAutopostDraftText/);
    expect(importLines).not.toMatch(/from ['"]\.\/client['"]|from ['"]@\/lib\/ai\/openai['"]/);
    // deliver-post.ts is imported for its pure planDelivery() (the
    // Telegram preview) -- sendAutopostMessage, its one actually
    // Telegram-calling export, must never be among the named imports.
    expect(importLines).not.toMatch(/\bsendAutopostMessage\b/);
  });
});

describe('buildContentPlanDayDetail', () => {
  it('includes text preview and image thumbnail for the single requested day', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListSaints.mockResolvedValue([{ calendarDayId: 'day-1', name: 'Тестовий святий', imageUrl: 'https://x/icon.png' }]);

    const day = await buildContentPlanDayDetail('2026-08-30');

    expect(day.slots.saint_of_day.textPreview).toBe('Тестовий святий');
    expect(day.slots.saint_of_day.imageUrl).toBe('https://x/icon.png');
  });

  it('truncates a long text to the first ~200 characters', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListArticles.mockResolvedValue([{ calendarDayId: 'day-1', content: 'A'.repeat(500) }]);

    const day = await buildContentPlanDayDetail('2026-08-30');

    expect(day.slots.faith_story.textPreview).toHaveLength(200);
  });

  it('returns the full untruncated text separately from the 200-char preview, for editing', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListArticles.mockResolvedValue([{ calendarDayId: 'day-1', content: 'A'.repeat(500) }]);

    const day = await buildContentPlanDayDetail('2026-08-30');

    expect(day.slots.faith_story.fullText).toHaveLength(500);
    expect(day.slots.faith_story.textPreview).toHaveLength(200);
  });

  it('computes the Telegram delivery preview via the real planDelivery(): short text + image -> photo_with_caption', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListSaints.mockResolvedValue([{ calendarDayId: 'day-1', name: 'Коротке ім’я', imageUrl: 'https://x/icon.png' }]);

    const day = await buildContentPlanDayDetail('2026-08-30');

    expect(day.slots.saint_of_day.deliveryPreview).toEqual({ kind: 'photo_with_caption', photoCaption: null });
  });

  it('computes the Telegram delivery preview for long text + image -> photo_then_text, with the real fixed linked caption', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListGospel.mockResolvedValue([{ calendarDayId: 'day-1', text: 'А'.repeat(1500) }]);
    mockListSaints.mockResolvedValue([]); // no image source for gospel in this fixture
    // Give the gospel slot an image via a persisted post row instead.
    mockListTelegramPosts.mockResolvedValue([
      {
        publishDate: '2026-08-30',
        contentType: 'gospel',
        status: 'draft',
        text: null,
        mediaUrl: 'https://x/gospel.png',
        telegramMessageId: null,
        sentAt: null,
        verificationStatus: null,
        errorMessage: null,
      },
    ]);

    const day = await buildContentPlanDayDetail('2026-08-30');

    expect(day.slots.gospel.deliveryPreview).toEqual({
      kind: 'photo_then_text',
      photoCaption: '📖 Євангеліє дня\n☦️ Продовження — у наступному повідомленні.',
    });
  });

  it('computes the delivery preview as text_only when there is no image', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListArticles.mockResolvedValue([{ calendarDayId: 'day-1', content: 'Текст без зображення' }]);

    const day = await buildContentPlanDayDetail('2026-08-30');

    expect(day.slots.faith_story.deliveryPreview).toEqual({ kind: 'text_only', photoCaption: null });
  });

  it('maps a "ready" telegram_posts row to the READY publication status', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListTelegramPosts.mockResolvedValue([
      {
        publishDate: '2026-08-30',
        contentType: 'morning_prayer',
        status: 'ready',
        text: 'Готовий текст',
        mediaUrl: null,
        telegramMessageId: null,
        sentAt: null,
        verificationStatus: null,
        errorMessage: null,
      },
    ]);

    const report = await buildContentPlan('2026-08-30', '2026-08-30');

    expect(report.days[0].slots.morning_prayer.publicationStatus).toBe('READY');
  });

  it('maps a "sending" telegram_posts row (mid-flight autopost claim) to its own SENDING status, not READY/DRAFT', async () => {
    resetDefaults();
    mockListCalendarDays.mockResolvedValue([{ id: 'day-1', dateOldStyle: '2026-08-17', title: 'Тест' }]);
    mockListTelegramPosts.mockResolvedValue([
      {
        publishDate: '2026-08-30',
        contentType: 'morning_prayer',
        status: 'sending',
        text: 'Готовий текст',
        mediaUrl: null,
        telegramMessageId: null,
        sentAt: null,
        verificationStatus: null,
        errorMessage: null,
      },
    ]);

    const report = await buildContentPlan('2026-08-30', '2026-08-30');

    expect(report.days[0].slots.morning_prayer.publicationStatus).toBe('SENDING');
  });
});
