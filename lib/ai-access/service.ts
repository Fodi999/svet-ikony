import { d1All, d1First, d1Run, d1Prepare, d1Batch } from "@/lib/d1/db";
import { ApiError } from "@/lib/d1/errors";
import { requireSuperAdmin } from "@/lib/d1/auth";
import { validateSession } from "@/lib/d1/repositories/admin-sessions";
import { hashSessionToken } from "@/lib/d1/session-token";
import { environment, grantPolicy, requireScope, type Mode } from "./policy";
export const sha = hashSessionToken;
const now = () => new Date().toISOString();
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return (
    "ai_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}
function pairingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % 32])
    .join("")
    .match(/.{4}/g)!
    .join("-");
}
export type Grant = {
  id: string;
  admin_user_id: string;
  environment: string;
  mode: Mode;
  scopes_json: string;
  status: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};
export type Access = { grant: Grant; scopes: string[]; tokenId: string };
export async function browserAdmin(request: Request) {
  await requireSuperAdmin(request);
  const raw = request.headers.get("X-Admin-Session");
  if (!raw) throw ApiError.authentication("Session required");
  const s = await validateSession(await sha(raw), now());
  if (s.outcome !== "valid") throw ApiError.authentication("Session invalid");
  if (s.user.role !== "super_admin")
    throw ApiError.authorization("Super admin required");
  return s.user;
}
export async function issueGrant(userId: string, env: string, input: unknown) {
  const p = grantPolicy(input),
    id = crypto.randomUUID(),
    createdAt = now(),
    expiresAt = new Date(Date.now() + p.durationMinutes * 60000).toISOString();
  const code = pairingCode(),
    codeExpiresAt = new Date(Date.now() + 120000).toISOString();
  await d1Batch([
    await d1Prepare(
      "INSERT INTO ai_access_grants (id,admin_user_id,environment,mode,scopes_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
      id,
      userId,
      env,
      p.mode,
      JSON.stringify(p.scopes),
      createdAt,
      expiresAt,
    ),
    await d1Prepare(
      "INSERT INTO ai_pairing_codes (id,grant_id,code_hash,expires_at,created_at) VALUES (?,?,?,?,?)",
      crypto.randomUUID(),
      id,
      await sha(code.replaceAll("-", "")),
      codeExpiresAt,
      createdAt,
    ),
  ]);
  return {
    id,
    mode: p.mode,
    scopes: p.scopes,
    createdAt,
    expiresAt,
    pairingCode: code,
    codeExpiresAt,
  };
}
export async function listGrants(userId: string, env: string) {
  const rows = await d1All<Grant & { paired: number }>(
    "SELECT g.*, EXISTS(SELECT 1 FROM ai_access_tokens t WHERE t.grant_id=g.id AND t.revoked_at IS NULL AND t.expires_at>?) AS paired FROM ai_access_grants g WHERE admin_user_id=? AND environment=? ORDER BY created_at DESC LIMIT 50",
    now(),
    userId,
    env,
  );
  return rows.map((g) => ({
    id: g.id,
    mode: g.mode,
    scopes: JSON.parse(g.scopes_json),
    createdAt: g.created_at,
    expiresAt: g.expires_at,
    lastActivity: g.last_used_at,
    status: g.revoked_at
      ? "revoked"
      : g.expires_at <= now()
        ? "expired"
        : "active",
    connected: !!g.paired && !g.revoked_at && g.expires_at > now(),
  }));
}
export async function ownedGrant(id: string, userId: string, env: string) {
  const g = await d1First<Grant>(
    "SELECT * FROM ai_access_grants WHERE id=? AND admin_user_id=? AND environment=?",
    id,
    userId,
    env,
  );
  if (!g) throw ApiError.notFound("Grant not found");
  return g;
}
export async function revokeGrant(id: string, userId: string, env: string) {
  await ownedGrant(id, userId, env);
  const t = now();
  await d1Batch([
    await d1Prepare(
      "UPDATE ai_access_grants SET status='revoked',revoked_at=? WHERE id=?",
      t,
      id,
    ),
    await d1Prepare(
      "UPDATE ai_access_tokens SET revoked_at=? WHERE grant_id=?",
      t,
      id,
    ),
    await d1Prepare(
      "UPDATE ai_pairing_codes SET used_at=? WHERE grant_id=? AND used_at IS NULL",
      t,
      id,
    ),
  ]);
  return { revoked: true };
}
export async function renewCode(id: string, userId: string, env: string) {
  const g = await ownedGrant(id, userId, env);
  if (g.status !== "active" || g.expires_at <= now())
    throw ApiError.authorization("Grant is inactive");
  const code = pairingCode(),
    t = now(),
    expiresAt = new Date(
      Math.min(Date.now() + 120000, Date.parse(g.expires_at)),
    ).toISOString();
  await d1Batch([
    await d1Prepare(
      "UPDATE ai_pairing_codes SET used_at=? WHERE grant_id=? AND used_at IS NULL",
      t,
      id,
    ),
    await d1Prepare(
      "INSERT INTO ai_pairing_codes (id,grant_id,code_hash,expires_at,created_at) SELECT ?,id,?,?,? FROM ai_access_grants WHERE id=? AND status='active' AND expires_at>?",
      crypto.randomUUID(),
      await sha(code.replaceAll("-", "")),
      expiresAt,
      t,
      id,
      t,
    ),
  ]);
  return { pairingCode: code, codeExpiresAt: expiresAt };
}
export async function rateLimit(ip: string) {
  const t = now(),
    window = Math.floor(Date.now() / 60000),
    end = new Date((window + 1) * 60000).toISOString();
  for (const [key, max] of [
    [await sha(ip), 20],
    ["global", 300],
  ] as const) {
    const row = await d1First<{ attempts: number }>(
      "INSERT INTO ai_exchange_limits (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
      key + ":" + window,
      end,
    );
    if ((row?.attempts ?? max + 1) > max)
      throw ApiError.rateLimited("Pairing attempts exceeded", 60);
  }
  await d1Run(
    "DELETE FROM ai_exchange_limits WHERE expires_at<?",
    new Date(Date.now() - 60000).toISOString(),
  );
}
export async function exchange(request: Request) {
  const env = environment(request);
  await rateLimit(request.headers.get("cf-connecting-ip") || "unknown");
  const body: unknown = await request.json();
  const p =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { pairingCode?: unknown })
      : {};
  const code =
    typeof p.pairingCode === "string"
      ? p.pairingCode.toUpperCase().replaceAll("-", "")
      : "";
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(code))
    throw ApiError.authentication("Invalid or expired pairing code");
  const token = randomToken(),
    tokenHash = await sha(token),
    exchangeId = crypto.randomUUID(),
    t = now();
  await d1Batch([
    await d1Prepare(
      "UPDATE ai_pairing_codes SET used_at=?,exchange_id=? WHERE code_hash=? AND used_at IS NULL AND expires_at>? AND grant_id IN (SELECT g.id FROM ai_access_grants g JOIN admin_users u ON u.id=g.admin_user_id WHERE g.status='active' AND g.revoked_at IS NULL AND g.expires_at>? AND g.environment=? AND u.active=1 AND u.role='super_admin')",
      t,
      exchangeId,
      await sha(code),
      t,
      t,
      env,
    ),
    await d1Prepare(
      "INSERT INTO ai_access_tokens (id,grant_id,token_hash,created_at,expires_at) SELECT ?,g.id,?,?,g.expires_at FROM ai_access_grants g JOIN ai_pairing_codes c ON c.grant_id=g.id WHERE c.exchange_id=?",
      crypto.randomUUID(),
      tokenHash,
      t,
      exchangeId,
    ),
  ]);
  const g = await d1First<Grant>(
    "SELECT g.* FROM ai_access_grants g JOIN ai_access_tokens t ON t.grant_id=g.id WHERE t.token_hash=?",
    tokenHash,
  );
  if (!g) throw ApiError.authentication("Invalid or expired pairing code");
  return {
    accessToken: token,
    expiresAt: g.expires_at,
    mode: g.mode,
    scopes: JSON.parse(g.scopes_json),
  };
}
export async function requireAiAccess(
  request: Request,
  scope?: string,
): Promise<Access> {
  const raw = request.headers
    .get("authorization")
    ?.match(/^Bearer (ai_[a-f0-9]{64})$/)?.[1];
  if (!raw) throw new ApiError(401, "AI_ACCESS_INVALID", "AI access required");
  const t = now();
  const row = await d1First<
    Grant & {
      token_id: string;
      token_expires: string;
      token_revoked: string | null;
      active: number;
      role: string;
    }
  >(
    "SELECT g.*,t.id AS token_id,t.expires_at AS token_expires,t.revoked_at AS token_revoked,u.active,u.role FROM ai_access_tokens t JOIN ai_access_grants g ON g.id=t.grant_id JOIN admin_users u ON u.id=g.admin_user_id WHERE t.token_hash=?",
    await sha(raw),
  );
  if (!row) throw new ApiError(401, "AI_ACCESS_INVALID", "AI access invalid");
  if (
    row.revoked_at ||
    row.token_revoked ||
    row.status !== "active" ||
    !row.active ||
    row.role !== "super_admin"
  )
    throw new ApiError(401, "AI_ACCESS_REVOKED", "AI access revoked");
  if (row.expires_at <= t || row.token_expires <= t)
    throw new ApiError(401, "AI_ACCESS_EXPIRED", "AI access expired");
  if (row.environment !== environment(request))
    throw new ApiError(403, "AI_ENVIRONMENT_DENIED", "Environment mismatch");
  const scopes = JSON.parse(row.scopes_json) as string[];
  if (scope && !scopes.includes(scope)) {
    await activity(
      { grant: row, scopes, tokenId: row.token_id },
      scope.split(".")[0],
      "denied",
      null,
      "failed",
      crypto.randomUUID(),
    );
    requireScope(scopes, scope);
  }
  const cutoff = new Date(Date.now() - 30000).toISOString();
  await d1Run(
    "UPDATE ai_access_grants SET last_used_at=? WHERE id=? AND (last_used_at IS NULL OR last_used_at<?)",
    t,
    row.id,
    cutoff,
  );
  await d1Run(
    "UPDATE ai_access_tokens SET last_used_at=? WHERE id=? AND (last_used_at IS NULL OR last_used_at<?)",
    t,
    row.token_id,
    cutoff,
  );
  return { grant: row, scopes, tokenId: row.token_id };
}
export async function activity(
  access: Access,
  module: string,
  operation: string,
  targetId: string | null,
  status: string,
  requestId: string,
  targetType = module,
) {
  await d1Run(
    "INSERT INTO ai_activity_log (id,grant_id,admin_user_id,tool_name,module,operation,target_type,target_id,request_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    crypto.randomUUID(),
    access.grant.id,
    access.grant.admin_user_id,
    module + "." + operation,
    module,
    operation,
    targetType,
    targetId,
    requestId,
    status,
    now(),
  );
}
export async function activityList(userId: string, env: string) {
  return d1All(
    "SELECT a.* FROM ai_activity_log a JOIN ai_access_grants g ON g.id=a.grant_id WHERE (g.admin_user_id=? OR a.admin_user_id=?) AND g.environment=? ORDER BY a.created_at DESC LIMIT 100",
    userId,
    userId,
    env,
  );
}
