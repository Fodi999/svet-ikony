import { getCloudflareContext } from '@opennextjs/cloudflare';

/** The D1 binding declared in wrangler.jsonc (`d1_databases[0].binding = "DB"`). */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

/** The R2 binding declared in wrangler.jsonc (`r2_buckets[0].binding =
 * "MEDIA_BUCKET"`, Stage 2D). */
export async function getMediaBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.MEDIA_BUCKET;
}

export async function getAdminJwtSecret(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = env.ADMIN_JWT_SECRET || env.JWT_SECRET;
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET (or JWT_SECRET) is not configured');
  }
  return secret;
}
