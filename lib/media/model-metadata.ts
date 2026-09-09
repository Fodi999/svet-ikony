import { getMediaBucket } from '@/lib/d1/env';
import { ApiError } from '@/lib/d1/errors';
import { validateMediaKey } from './keys';
import { MAX_MODEL_BYTES } from './constants';

/** Metadata is verified against the uploaded object, never trusted from JSON. */
export async function uploadedModelMetadata(key: unknown) {
  if (typeof key !== 'string' || !validateMediaKey(key) || !/^media\/visualizer\/[^/]+\/model\/[^/]+\.glb$/.test(key)) {
    throw ApiError.validation('Оберіть GLB, завантажений у візуалізатор');
  }
  const object = await (await getMediaBucket()).head(key);
  if (!object) throw ApiError.validation('Завантажену модель не знайдено');
  if (!object.size || object.size > MAX_MODEL_BYTES) throw ApiError.validation('Неприпустимий розмір моделі');
  return { r2Key: key, filename: object.customMetadata?.filename || key.split('/').pop()!, mimeType: 'model/gltf-binary', fileSize: object.size };
}
