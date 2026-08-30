/** OpenAI image generation for the Telegram autopost pipeline -- see
 * lib/telegram/autopost-image.ts, the only caller. Deliberately never takes
 * D1 facts or a saint's name as input (see content-format.ts's
 * CONTENT_TYPE_IMAGE_PROMPTS): the prompt is a fixed, generic "Світло
 * Ікони" house-style scene selected purely by content type, so it can
 * never invent a specific saint's portrait. */
import { OpenAiError } from './openai';

const OPENAI_IMAGES_API_URL = 'https://api.openai.com/v1/images/generations';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';
const IMAGE_SIZE = '1024x1024';

export interface GenerateTelegramImageInput {
  apiKey: string;
  model?: string;
  /** Full prompt text, already including the house style + per-type scene
   * (see lib/telegram/content-format.ts's CONTENT_TYPE_IMAGE_PROMPTS). */
  prompt: string;
}

export interface GeneratedImage {
  bytes: ArrayBuffer;
  mimeType: string;
}

interface ImageGenerationResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function generateTelegramImage(input: GenerateTelegramImageInput): Promise<GeneratedImage> {
  const response = await fetch(OPENAI_IMAGES_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_IMAGE_MODEL,
      prompt: input.prompt,
      size: IMAGE_SIZE,
      n: 1,
    }),
  });

  let body: ImageGenerationResponse;
  try {
    body = await response.json();
  } catch {
    throw new OpenAiError(`OpenAI image API returned a non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new OpenAiError(body.error?.message ?? `OpenAI image request failed (HTTP ${response.status})`);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) {
    throw new OpenAiError('OpenAI image API returned no image data');
  }

  return { bytes: base64ToArrayBuffer(b64), mimeType: 'image/png' };
}
