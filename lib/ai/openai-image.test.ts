import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_IMAGE_MODEL, generateTelegramImage } from './openai-image';
import { CONTENT_TYPE_IMAGE_PROMPTS, IMAGE_VISUAL_STYLE } from '@/lib/telegram/content-format';
const png = 'iVBORw0KGgo=';
afterEach(() => vi.unstubAllGlobals());
describe('GPT Image 2 client', () => {
  it('uses the requested image model and the explicit PNG contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({data:[{b64_json:png}]}));
    vi.stubGlobal('fetch',fetchMock);
    const result = await generateTelegramImage({apiKey:'test-key',prompt:'A quiet church'});
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(options.body)).toEqual({model:'gpt-image-2',prompt:'A quiet church',size:'1024x1024',quality:'medium',output_format:'png',n:1});
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(DEFAULT_IMAGE_MODEL).toBe('gpt-image-2');
    expect(result.mimeType).toBe('image/png');
    expect(result.bytes.byteLength).toBe(8);
  });
  it('honors an explicit supported image model override', async () => {
    const fetchMock=vi.fn().mockResolvedValue(Response.json({data:[{b64_json:png}]}));vi.stubGlobal('fetch',fetchMock);
    await generateTelegramImage({apiKey:'test-key',model:'gpt-image-2-2026-04-21',prompt:'Scene'});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('gpt-image-2-2026-04-21');
  });
  it.each([401,403,429,500])('does not retry or expose provider body on HTTP %s',async status=>{
    const fetchMock=vi.fn().mockResolvedValue(Response.json({error:{message:'Authorization: Bearer secret-value'}},{status}));vi.stubGlobal('fetch',fetchMock);
    const error=await generateTelegramImage({apiKey:'test-key',prompt:'Scene'}).catch(e=>e);
    expect(error.message).toContain(`HTTP ${status}`);expect(error.message).not.toContain('secret-value');expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['', 'invalid!base64', 'aGVsbG8='])('rejects a missing or invalid PNG before R2 storage',async value=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[{b64_json:value}]})));
    await expect(generateTelegramImage({apiKey:'test-key',prompt:'Scene'})).rejects.toThrow();
  });
  it('keeps the shared visual style free of the no-portrait contradiction',()=>{
    expect(IMAGE_VISUAL_STYLE).not.toContain('Без обличчя');
    for (const prompt of Object.values(CONTENT_TYPE_IMAGE_PROMPTS)) {
      expect(prompt).toContain('Без обличчя');expect(prompt).toContain('водяних знаків');expect(prompt).toContain('мобільному екрані');
    }
  });
});
