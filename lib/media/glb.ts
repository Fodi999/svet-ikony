import { ApiError } from '@/lib/d1/errors';

type TextureRef = { index?: number; texCoord?: number };
type GltfJson = {
  asset?: { version?: string }; buffers?: { uri?: string }[]; images?: { uri?: string }[];
  materials?: { name?: string; pbrMetallicRoughness?: { baseColorTexture?: TextureRef; metallicRoughnessTexture?: TextureRef }; normalTexture?: TextureRef; occlusionTexture?: TextureRef; emissiveTexture?: TextureRef }[];
  meshes?: { name?: string; primitives?: { attributes?: Record<string, number>; material?: number }[] }[];
};

/** A textured material on a primitive without the matching TEXCOORD_n
 * attribute makes CesiumJS generate `v_texCoord_-1` and the WebGL shader
 * fails to compile -- which blacks out the whole globe, not just the model. */
export function missingTexCoords(data: GltfJson): { mesh: string; material: string; set: number } | null {
  const materials = Array.isArray(data.materials) ? data.materials : [];
  for (const mesh of Array.isArray(data.meshes) ? data.meshes : []) {
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      const material = typeof primitive?.material === 'number' ? materials[primitive.material] : undefined;
      if (!material) continue;
      const refs = [material.pbrMetallicRoughness?.baseColorTexture, material.pbrMetallicRoughness?.metallicRoughnessTexture,
        material.normalTexture, material.occlusionTexture, material.emissiveTexture];
      for (const ref of refs) {
        if (!ref) continue;
        const set = Number.isInteger(ref.texCoord) ? ref.texCoord as number : 0;
        if (!primitive.attributes || typeof primitive.attributes[`TEXCOORD_${set}`] !== 'number') {
          return { mesh: mesh.name || 'mesh', material: material.name || 'material', set };
        }
      }
    }
  }
  return null;
}

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
  let data: GltfJson;
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
  const missing = missingTexCoords(data);
  if (missing) {
    throw ApiError.validation(`Матеріал «${missing.material}» має текстуру, але об'єкт «${missing.mesh}» не має UV (TEXCOORD_${missing.set}). Додайте UV-розгортку в Blender і експортуйте знову`);
  }
  let offset = 20 + jsonLength;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw ApiError.validation('Неповний GLB-блок');
    const length = view.getUint32(offset, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) throw ApiError.validation('Некоректна довжина GLB-блоку');
    offset += 8 + length;
  }
}
