import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeSaintIconography, generateChurchContent } from './church-content';

function chatResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('generateChurchContent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Task: "Найден production content-quality bug" -- the same language
  // rule strengthened in lib/ai/openai.ts's system prompt (see
  // openai.test.ts), applied to the Church Calendar editor's own prompt too
  // (task section 6: "проверить также AI generation для Church Calendar").
  it('the system prompt explicitly forbids English/Russian/Polish/transliterated phrases mid-sentence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('деякий текст'));
    vi.stubGlobal('fetch', fetchMock);

    await generateChurchContent({
      apiKey: 'fake-key',
      kind: 'description',
      civilDateIso: '2026-09-03',
      julianDateIso: '2026-08-21',
      title: 'Тестовий Святий',
      facts: 'Тестові факти',
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system').content as string;
    expect(systemMessage).toMatch(/ВИКЛЮЧНО українською/);
    expect(systemMessage).toMatch(/англійською, російською, польською/);
  });
});

describe('describeSaintIconography', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the reference image as a vision content part alongside the saint name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('давньоруське вбрання, коротка борода'));
    vi.stubGlobal('fetch', fetchMock);

    await describeSaintIconography({ apiKey: 'fake-key', imageUrl: 'https://upload.wikimedia.org/x.jpg', saintName: 'Флор і Лавр' });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === 'user');
    const imagePart = userMessage.content.find((part: { type: string }) => part.type === 'image_url');
    expect(imagePart.image_url.url).toBe('https://upload.wikimedia.org/x.jpg');
    const textPart = userMessage.content.find((part: { type: string }) => part.type === 'text');
    expect(textPart.text).toContain('Флор і Лавр');
  });

  it('returns the trimmed description text on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse('  давньоруське вбрання, короткі бороди  ')));

    const result = await describeSaintIconography({ apiKey: 'fake-key', imageUrl: 'https://x/img.jpg', saintName: 'Флор і Лавр' });

    expect(result).toBe('давньоруське вбрання, короткі бороди');
  });

  it('returns null (never throws) when the model reports the image unusable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse('НЕПРИДАТНО')));

    const result = await describeSaintIconography({ apiKey: 'fake-key', imageUrl: 'https://x/img.jpg', saintName: 'Хтось' });

    expect(result).toBeNull();
  });

  it('returns null (never throws) when the request fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const result = await describeSaintIconography({ apiKey: 'fake-key', imageUrl: 'https://x/img.jpg', saintName: 'Хтось' });

    expect(result).toBeNull();
  });

  it('returns null (never throws) on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse('rate limited', 429)));

    const result = await describeSaintIconography({ apiKey: 'fake-key', imageUrl: 'https://x/img.jpg', saintName: 'Хтось' });

    expect(result).toBeNull();
  });

  it('returns null (never throws) on an empty completion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse('')));

    const result = await describeSaintIconography({ apiKey: 'fake-key', imageUrl: 'https://x/img.jpg', saintName: 'Хтось' });

    expect(result).toBeNull();
  });
});
