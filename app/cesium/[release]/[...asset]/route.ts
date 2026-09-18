import {getMediaBucket} from '@/lib/d1/env';
import {cesiumDataKey} from '@/lib/cesium/delivery';

type Context = {params: Promise<{release: string; asset: string[]}>};
async function deliver(request: Request, context: Context, headOnly: boolean) {
  const {release, asset} = await context.params;
  const key = cesiumDataKey(release, asset);
  if (!key) return new Response(null, {status: 404});
  const bucket = await getMediaBucket();
  // Release readiness is written only after uploader verification.
  if (!await bucket.head(`cesium/releases/${release}/READY.json`)) return new Response(null, {status: 404});
  const metadata = await bucket.head(key);
  if (!metadata) return new Response(null, {status: 404});
  const mime = key.endsWith('.json') ? 'application/json' : key.endsWith('.jpg') ? 'image/jpeg' : key.endsWith('.png') ? 'image/png' : 'application/octet-stream';
  const headers = new Headers({'content-type': mime, 'cache-control': 'public, max-age=31536000, immutable',
    'etag': metadata.httpEtag, 'x-content-type-options': 'nosniff'});
  if (request.headers.get('if-none-match') === metadata.httpEtag) return new Response(null, {status: 304, headers});
  headers.set('content-length', String(metadata.size));
  if (headOnly) return new Response(null, {headers});
  const object = await bucket.get(key);
  if (!object) return new Response(null, {status: 404});
  return new Response(object.body, {headers});
}
export const GET = (request: Request, context: Context) => deliver(request, context, false);
export const HEAD = (request: Request, context: Context) => deliver(request, context, true);
