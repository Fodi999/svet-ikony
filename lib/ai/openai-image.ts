/** Shared Images API client for calendar and Telegram preparation.
 * Callers own scene/identity policy. This client preserves the PNG/R2 contract. */
import { OpenAiError } from './openai';

const OPENAI_IMAGES_API_URL = 'https://api.openai.com/v1/images/generations';
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
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
    signal: AbortSignal.timeout(90000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_IMAGE_MODEL,
      prompt: input.prompt,
      size: IMAGE_SIZE,
      quality: "medium",
      output_format: "png",
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
    // Provider error bodies can contain request data; never persist them in
    // image_error or surface them verbatim in an admin toast.
    const reason = response.status === 401 || response.status === 403 ? 'check API access to the image model'
      : response.status === 429 ? 'rate limit or quota exceeded' : 'image generation failed';
    throw new OpenAiError(`OpenAI image API: ${reason} (HTTP ${response.status})`);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) {
    throw new OpenAiError('OpenAI image API returned no image data');
  }

  let bytes: ArrayBuffer;
  try { bytes = base64ToArrayBuffer(b64); } catch { throw new OpenAiError('OpenAI returned invalid image encoding'); }
  const signature = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value))
    throw new OpenAiError('OpenAI returned an invalid PNG image');
  return { bytes, mimeType: 'image/png' };
}
