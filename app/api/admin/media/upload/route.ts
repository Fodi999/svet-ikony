import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors, ApiError } from '@/lib/d1/errors';
import { getMediaBucket } from '@/lib/d1/env';
import { absoluteSiteUrl } from '@/lib/site';
import { IMAGE_MIME_EXTENSIONS, AUDIO_MIME_EXTENSIONS, maxBytesForKind, mediaKindForPurpose } from '@/lib/media/constants';
import { generateMediaKey, isAllowedPurpose, isSafeEntityId, isAllowedModule } from '@/lib/media/keys';
import type { MediaObjectDto } from '@/lib/media/types';

/** Field values are never trusted at face value — every one of module/
 * entityId/purpose/file is validated before generateMediaKey() is even
 * called (which would itself throw on a bad value, but the checks here
 * produce the specific 400 messages the Stage 2D smoke test expects,
 * rather than one generic "bad key" error). */
export async function POST(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw ApiError.validation('Request body is not valid multipart/form-data');
    }

    const file = form.get('file');
    const module = form.get('module');
    const entityId = form.get('entityId');
    const purpose = form.get('purpose');

    if (!(file instanceof File)) throw ApiError.validation('file is required');
    if (typeof module !== 'string' || !module) throw ApiError.validation('module is required');
    if (typeof entityId !== 'string' || !entityId) throw ApiError.validation('entityId is required');
    if (typeof purpose !== 'string' || !purpose) throw ApiError.validation('purpose is required');

    if (!isAllowedModule(module)) throw ApiError.validation(`Unknown module: ${module}`);
    if (!isSafeEntityId(entityId)) throw ApiError.validation('entityId contains unsafe characters');
    if (!isAllowedPurpose(module, purpose)) throw ApiError.validation(`Purpose "${purpose}" is not allowed for module "${module}"`);

    if (file.size === 0) throw ApiError.validation('file is empty');

    const kind = mediaKindForPurpose(purpose);
    const allowedMimeForKind = kind === 'audio' ? AUDIO_MIME_EXTENSIONS : IMAGE_MIME_EXTENSIONS;
    if (!Object.prototype.hasOwnProperty.call(allowedMimeForKind, file.type)) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', `Unsupported ${kind} MIME type`, file.type || '(missing content type)');
    }

    const maxBytes = maxBytesForKind(kind);
    if (file.size > maxBytes) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'File exceeds the maximum allowed size', `${file.size} > ${maxBytes} bytes`);
    }

    const key = generateMediaKey({ module, entityId, purpose, mimeType: file.type });

    const bucket = await getMediaBucket();
    const body = await file.arrayBuffer();
    const putResult = await bucket.put(key, body, {
      httpMetadata: { contentType: file.type },
      // UUID-named keys are never reused for a different file, so a long,
      // immutable Cache-Control on the object itself is safe — the public
      // GET route (Step 6) is what actually sends this header to clients;
      // storing it in R2's own httpMetadata keeps R2's `.get()` response
      // consistent with what GET /media/* serves.
      customMetadata: { module, entityId, purpose },
    });

    if (!putResult) {
      throw ApiError.internal(new Error(`R2 put() returned no result for key ${key}`));
    }

    const dto: MediaObjectDto = {
      key,
      url: absoluteSiteUrl(`/${key}`),
      contentType: file.type,
      size: file.size,
      etag: putResult.etag,
      kind,
    };
    return Response.json(dto, { status: 201 });
  });
}
