import { requireAiAccess, activity } from "@/lib/ai-access/service";
import { requireScope } from "@/lib/ai-access/policy";
import { withErrors, ApiError } from "@/lib/d1/errors";
import { getMediaBucket } from "@/lib/d1/env";
import { absoluteSiteUrl } from "@/lib/site";
import {
  IMAGE_MIME_EXTENSIONS,
  AUDIO_MIME_EXTENSIONS,
  MODEL_MIME_EXTENSIONS,
  maxBytesForKind,
  mediaKindForPurpose,
} from "@/lib/media/constants";
import {
  generateMediaKey,
  isAllowedPurpose,
  isSafeEntityId,
  isAllowedModule,
} from "@/lib/media/keys";
import { validateGlb } from "@/lib/media/glb";
import type { MediaObjectDto } from "@/lib/media/types";

/** Field values are never trusted at face value — every one of module/
 * entityId/purpose/file is validated before generateMediaKey() is even
 * called (which would itself throw on a bad value, but the checks here
 * produce the specific 400 messages the Stage 2D smoke test expects,
 * rather than one generic "bad key" error). */
export async function POST(request: Request) {
  return withErrors(async () => {
    const access = await requireAiAccess(request, "media.upload");
    requireScope(access.scopes, "r2.upload");
    if (access.grant.mode !== "DRAFT_EDIT")
      throw ApiError.authorization("Draft access required");
    const requestId = crypto.randomUUID();
    try {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        throw ApiError.validation(
          "Request body is not valid multipart/form-data",
        );
      }

      const file = form.get("file");
      const mediaModule = form.get("module");
      const entityId = form.get("entityId");
      const purpose = form.get("purpose");

      if (!(file instanceof File))
        throw ApiError.validation("file is required");
      if (typeof mediaModule !== "string" || !mediaModule)
        throw ApiError.validation("module is required");
      if (typeof entityId !== "string" || !entityId)
        throw ApiError.validation("entityId is required");
      if (typeof purpose !== "string" || !purpose)
        throw ApiError.validation("purpose is required");

      if (!isAllowedModule(mediaModule))
        throw ApiError.validation(`Unknown module: ${mediaModule}`);
      if (!isSafeEntityId(entityId))
        throw ApiError.validation("entityId contains unsafe characters");
      if (!isAllowedPurpose(mediaModule, purpose))
        throw ApiError.validation(
          `Purpose "${purpose}" is not allowed for module "${mediaModule}"`,
        );

      if (file.size === 0) throw ApiError.validation("file is empty");

      const kind = mediaKindForPurpose(purpose);
      const contentType =
        kind === "model" &&
        (!file.type || file.type === "application/octet-stream")
          ? "model/gltf-binary"
          : file.type;
      const allowedMimeForKind =
        kind === "model"
          ? MODEL_MIME_EXTENSIONS
          : kind === "audio"
            ? AUDIO_MIME_EXTENSIONS
            : IMAGE_MIME_EXTENSIONS;
      if (
        !Object.prototype.hasOwnProperty.call(allowedMimeForKind, contentType)
      ) {
        throw new ApiError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          `Unsupported ${kind} MIME type`,
          file.type || "(missing content type)",
        );
      }
      // application/octet-stream is a generic catch-all (see MODEL_MIME_EXTENSIONS's
      // own doc comment) -- for model uploads specifically, also require the
      // filename to actually end in .glb before trusting it.
      if (kind === "model" && !file.name.toLowerCase().endsWith(".glb")) {
        throw new ApiError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Unsupported model MIME type",
          `filename "${file.name}" does not end in .glb`,
        );
      }

      const maxBytes = maxBytesForKind(kind);
      if (file.size > maxBytes) {
        throw new ApiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "File exceeds the maximum allowed size",
          `${file.size} > ${maxBytes} bytes`,
        );
      }

      if (kind === "audio")
        throw ApiError.authorization("AI audio upload unavailable");
      if (kind === "model")
        requireScope(access.scopes, "visualizer.model.upload");
      const key = generateMediaKey({
        module: mediaModule,
        entityId,
        purpose,
        mimeType: contentType,
      });

      const bucket = await getMediaBucket();
      const body = await file.arrayBuffer();
      if (kind === "model") validateGlb(body);
      const putResult = await bucket.put(key, body, {
        httpMetadata: { contentType },
        // UUID-named keys are never reused for a different file, so a long,
        // immutable Cache-Control on the object itself is safe — the public
        // GET route (Step 6) is what actually sends this header to clients;
        // storing it in R2's own httpMetadata keeps R2's `.get()` response
        // consistent with what GET /media/* serves.
        customMetadata: {
          module: mediaModule,
          entityId,
          purpose,
          filename: file.name.replace(/[\\/]/g, "_").slice(0, 200),
        },
      });

      if (!putResult) {
        throw ApiError.internal(
          new Error(`R2 put() returned no result for key ${key}`),
        );
      }

      const dto: MediaObjectDto = {
        key,
        url: await absoluteSiteUrl(`/${key}`),
        contentType,
        size: file.size,
        etag: putResult.etag,
        kind,
      };
      await activity(access, "media", "upload", key, "success", requestId);
      return Response.json(dto, {
        status: 201,
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      await activity(access, "media", "upload", null, "failed", requestId);
      throw error;
    }
  });
}
