import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeSaintIconography } from './church-content';

function chatResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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
