import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireTerrainLocal } from '@/lib/terrain/http';
import { ApiError, withErrors } from '@/lib/d1/errors';

/**
 * Dev-only: serves the locally Blender-exported Earth GLB straight from
 * disk, for `EARTH_ASSET_MODE=local` preview (Phase C, see
 * EARTH_ASSET_CONTRACT.md). Reuses the exact same dev+localhost gate the
 * terrain local API already relies on (`requireTerrainLocal` -- a runtime
 * check on NODE_ENV and request hostname, not just an env flag), so this
 * route is unreachable in any deployed/production build regardless of what
 * EARTH_ASSET_MODE is set to there. Never touches R2 or D1.
 */
const EARTH_PREVIEW_PATH = path.join(process.cwd(), 'tools/earth/export/earth.glb');
const MISSING_FILE_MESSAGE =
  'Local Earth preview file not found.\nExport Blender Earth to tools/earth/export/earth.glb';

async function handle(request: Request) {
  return withErrors(async () => {
    requireTerrainLocal(request);

    let body: ArrayBuffer;
    try {
      const view = await readFile(EARTH_PREVIEW_PATH);
      // A plain slice() always yields a standalone ArrayBuffer (never
      // SharedArrayBuffer), satisfying the strict BodyInit type Buffer's
      // own .buffer does not.
      body = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(MISSING_FILE_MESSAGE);
        throw ApiError.notFound(MISSING_FILE_MESSAGE);
      }
      throw error;
    }

    const headers = {
      'content-type': 'model/gltf-binary',
      'content-length': String(body.byteLength),
      // Every new Blender export must be picked up on the next page reload,
      // with no query-string cache-busting -- unlike the immutable,
      // UUID-keyed R2 delivery this preview stands in for.
      'cache-control': 'no-store',
    };
    if (request.method === 'HEAD') return new Response(null, { headers });
    return new Response(body, { headers });
  });
}

export const GET = handle;
export const HEAD = handle;
