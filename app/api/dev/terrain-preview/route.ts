import { access } from 'node:fs/promises';
import path from 'node:path';
import { requireTerrainLocal } from '@/lib/terrain/http';
import { withErrors } from '@/lib/d1/errors';

export async function GET(request: Request) {
  return withErrors(async () => {
    requireTerrainLocal(request);
    const files = ['L0/manifest.json', 'L1/manifest.json', 'L2/manifest.json', 'L2/heights.bin'];
    const alpsReady = await Promise.all(files.map(file =>
      access(path.join(process.cwd(), 'tools/terrain/alps/build', file)).then(() => true, () => false)
    )).then(values => values.every(Boolean));
    return Response.json({ localEarthPreview: process.env.EARTH_ASSET_MODE === 'local', alpsReady },
      { headers: { 'cache-control': 'no-store' } });
  });
}
