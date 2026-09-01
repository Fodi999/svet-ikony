import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTelegramPost } from './openai';

function mockOpenAiFetch(completionText: string) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ choices: [{ message: { content: completionText } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  );
}

function baseInput(overrides: Partial<Parameters<typeof generateTelegramPost>[0]> = {}) {
  return {
    apiKey: 'fake-key',
    contentTypeLabel: 'Святий дня',
    formatHint: 'ТЕСТОВИЙ_ФОРМАТ_МАРКЕР',
    targetLengthMin: 1800,
    targetLengthMax: 3000,
    facts: 'Церковний календар: тестові факти',
    civilDateIso: '2026-08-31',
    julianDateIso: '2026-08-18',
    titleLine: '☦️ Тестовий Святий',
    ...overrides,
  };
}

describe('generateTelegramPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes the target length range and format hint in the request sent to OpenAI', async () => {
    const fetchMock = mockOpenAiFetch('some post text');
    vi.stubGlobal('fetch', fetchMock);

    await generateTelegramPost(baseInput());

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user').content as string;
    expect(userMessage).toContain('1800');
    expect(userMessage).toContain('3000');
    expect(userMessage).toContain('ТЕСТОВИЙ_ФОРМАТ_МАРКЕР');
  });

  it('the system prompt requires the mandatory signature and treats length as a goal, not a mandate', async () => {
    const fetchMock = mockOpenAiFetch('some post text');
    vi.stubGlobal('fetch', fetchMock);

    await generateTelegramPost(baseInput());

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system').content as string;
    expect(systemMessage).toContain('☦️ «Світло ікони»');
    expect(systemMessage).toMatch(/мета|ціль/i);
    expect(systemMessage).toMatch(/не привід вигадувати факти|непідтверджені відомості/i);
  });

  it('never truncates the returned text, regardless of length', async () => {
    const longCompletion = 'Текст. '.repeat(700); // ~4900 chars, above every target ceiling
    const fetchMock = mockOpenAiFetch(longCompletion);
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateTelegramPost(baseInput());

    expect(result).toBe(longCompletion.trim());
    expect(result.length).toBeGreaterThan(4000);
  });

  it('passes verifiedFacts through as an explicit "do not alter" instruction only when true', async () => {
    const fetchMock = mockOpenAiFetch('some post text');
    vi.stubGlobal('fetch', fetchMock);

    await generateTelegramPost(baseInput({ verifiedFacts: true }));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user').content as string;
    expect(userMessage).toContain('вже перевірені');
  });

  it('requires the exact title line to be reproduced verbatim when titleFlexible is unset', async () => {
    const fetchMock = mockOpenAiFetch('some post text');
    vi.stubGlobal('fetch', fetchMock);

    await generateTelegramPost(baseInput({ titleLine: '☦️ Флор і Лавр' }));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user').content as string;
    const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system').content as string;
    expect(userMessage).toContain('☦️ Флор і Лавр');
    expect(userMessage).toMatch(/рівно цей рядок, без жодних змін/);
    expect(systemMessage).toMatch(/назва публікації/);
  });

  it('allows a flexible thematic title, grounded only in the facts, when titleFlexible is true', async () => {
    const fetchMock = mockOpenAiFetch('some post text');
    vi.stubGlobal('fetch', fetchMock);

    await generateTelegramPost(baseInput({ titleLine: '☦️ Історія віри', titleFlexible: true }));

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user').content as string;
    expect(userMessage).toContain('☦️ Історія віри');
    expect(userMessage).toMatch(/можеш замінити власною короткою тематичною назвою/);
    expect(userMessage).toMatch(/ЛИШЕ на фактах/);
  });
});
