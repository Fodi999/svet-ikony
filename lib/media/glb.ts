import { ApiError } from '@/lib/d1/errors';

/** GLB v2 only. External resources would bypass our authenticated media proxy. */
export function validateGlb(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) {
    throw ApiError.validation('Файл має бути коректною GLB-моделлю версії 2');
  }
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength % 4 || 20 + jsonLength > buffer.byteLength) {
    throw ApiError.validation('Некоректний JSON-блок GLB');
  }
  let data: { asset?: { version?: string }; buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  try {
    data = JSON.parse(new TextDecoder().decode(buffer.slice(20, 20 + jsonLength)));
  } catch { throw ApiError.validation('Некоректний JSON у GLB'); }
  if (data?.asset?.version !== '2.0') throw ApiError.validation('Підтримується glTF 2.0');
  if ((data.buffers && !Array.isArray(data.buffers)) || (data.images && !Array.isArray(data.images))) throw ApiError.validation('Некоректні ресурси GLB');
  for (const resource of [...(data.buffers ?? []), ...(data.images ?? [])]) {
    if (!resource || (resource.uri !== undefined && typeof resource.uri !== 'string')) throw ApiError.validation('Некоректний ресурс GLB');
    if (resource.uri && !resource.uri.startsWith('data:')) {
      throw ApiError.validation('Експортуйте GLB з вбудованими текстурами та ресурсами');
    }
  }
  let offset = 20 + jsonLength;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw ApiError.validation('Неповний GLB-блок');
    const length = view.getUint32(offset, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) throw ApiError.validation('Некоректна довжина GLB-блоку');
    offset += 8 + length;
  }
}
