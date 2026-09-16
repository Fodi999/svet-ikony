/** OpenAI Images "edit" client for icon portfolio photos -- see
 * lib/church/icon-portfolio-actions.ts, the only caller. Deliberately
 * separate from lib/ai/openai-image.ts's generateTelegramImage(): that
 * function calls the text-to-image `images/generations` endpoint (JSON
 * body, no input image) and is used when there is no existing photo to
 * work from (a calendar day's saint illustration, generated from
 * scratch). This module calls the image-to-image `images/edits` endpoint
 * instead -- it takes the icon's OWN uploaded photo as input, so the
 * model edits/recomposes around real pixels it was given rather than
 * inventing a new depiction, which is what makes it safe to use for an
 * icon that already has a specific, real saint/feast depicted on it. */
import { OpenAiError } from './openai';

const OPENAI_IMAGE_EDITS_API_URL = 'https://api.openai.com/v1/images/edits';
export const DEFAULT_IMAGE_EDIT_MODEL = 'gpt-image-2';
const IMAGE_SIZE = '1024x1024';

export interface EditIconImageInput {
  apiKey: string;
  model?: string;
  /** The icon's own current photo, fetched from R2 -- the only visual
   * source of truth this call is given. */
  sourceImageBytes: ArrayBuffer;
  sourceImageMimeType: string;
  /** A fixed, deterministic scene prompt (see PORTFOLIO_PRESETS in
   * icon-portfolio-actions.ts) -- never admin-authored free text, same
   * reasoning as the calendar admin's removed custom-prompt feature. */
  prompt: string;
}

export interface GeneratedImage {
  bytes: ArrayBuffer;
  mimeType: string;
}

interface ImageEditResponse {
  data?: { b64_json?: string }[];
  error?: { message?: string };
}

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function editIconImage(input: EditIconImageInput): Promise<GeneratedImage> {
  const extension = MIME_TO_EXTENSION[input.sourceImageMimeType];
  if (!extension) throw new OpenAiError(`Unsupported source image type for editing: ${input.sourceImageMimeType}`);

  const form = new FormData();
  form.set('model', input.model ?? DEFAULT_IMAGE_EDIT_MODEL);
  form.set('prompt', input.prompt);
  form.set('size', IMAGE_SIZE);
  form.set('n', '1');
  form.set('image', new Blob([input.sourceImageBytes], { type: input.sourceImageMimeType }), `source.${extension}`);

  const response = await fetch(OPENAI_IMAGE_EDITS_API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(90000),
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });

  let body: ImageEditResponse;
  try {
    body = await response.json();
  } catch {
    throw new OpenAiError(`OpenAI image edit API returned a non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403 ? 'check API access to the image model'
      : response.status === 429 ? 'rate limit or quota exceeded' : 'image editing failed';
    throw new OpenAiError(`OpenAI image edit API: ${reason} (HTTP ${response.status})`);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) {
    throw new OpenAiError('OpenAI image edit API returned no image data');
  }

  let bytes: ArrayBuffer;
  try {
    const binary = atob(b64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) array[i] = binary.charCodeAt(i);
    bytes = array.buffer;
  } catch {
    throw new OpenAiError('OpenAI returned invalid image encoding');
  }
  const signature = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value))
    throw new OpenAiError('OpenAI returned an invalid PNG image');
  return { bytes, mimeType: 'image/png' };
}
