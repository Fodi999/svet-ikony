import { verifyAdminToken } from '@/lib/d1/auth';

/**
 * Stage 2E: public single-item routes (icons/prayers/saints/alphabet/
 * articles/gospel/calendar) accept the same `preview_token` query param the
 * old Koyeb backend did, so draft content can still be previewed via a
 * link. The old backend's preview-token format/secret lives in the Rust
 * codebase, not here, so it can't be replicated — this reuses the existing
 * admin JWT verification instead of inventing a new auth mechanism
 * (`verifyAdminToken`, same function `/api/admin/**` already uses).
 *
 * Consequence: any *old* preview links (minted by the retired backend)
 * stop granting draft access — they simply behave like a normal visitor
 * link now (published-only), never an error. New preview links must carry
 * a real admin JWT as `preview_token`.
 */
export async function isValidPreview(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await verifyAdminToken(token);
    return true;
  } catch {
    return false;
  }
}
