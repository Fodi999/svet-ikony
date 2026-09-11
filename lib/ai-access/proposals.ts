import { adapters } from "./content";
import { CATALOG } from "./catalog";
import { requireAiAccess, browserAdmin, sha } from "./service";
import { environment, requireScope } from "./policy";
import { d1All, d1First, d1Prepare, d1Batch } from "@/lib/d1/db";
import { ApiError } from "@/lib/d1/errors";
type Entity = keyof typeof adapters;
type Row = Record<string, unknown>;
type Proposal = {
  id: string;
  environment: string;
  target_type: Entity;
  target_id: string;
  target_version: string;
  target_snapshot_json: string;
  proposed_changes_json: string;
  status: string;
  created_by_ai_grant_id: string;
  [key: string]: unknown;
};
function entity(value: unknown): Entity {
  if (typeof value !== "string" || !Object.hasOwn(adapters, value))
    throw ApiError.validation("Unsupported target");
  return value as Entity;
}
const col = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const value = (v: unknown) =>
  v !== null && typeof v === "object"
    ? JSON.stringify(v)
    : typeof v === "boolean"
      ? Number(v)
      : v;
async function raw(e: Entity, id: string) {
  return d1First<Row>(`SELECT * FROM ${adapters[e].table} WHERE id=?`, id);
}
async function get(id: string, env: string) {
  const p = await d1First<Proposal>(
    "SELECT * FROM ai_proposals WHERE id=? AND environment=?",
    id,
    env,
  );
  if (!p) throw ApiError.notFound("Proposal not found");
  return p;
}
function view(p: Proposal, current: unknown = null) {
  const {
    target_snapshot_json,
    proposed_changes_json,
    review_nonce,
    sources_json,
    ...rest
  } = p;
  void review_nonce;
  const original = JSON.parse(target_snapshot_json) as Row;
  const before = Object.fromEntries(
    Object.entries(original).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      v,
    ]),
  );
  return {
    ...rest,
    before,
    patch: JSON.parse(proposed_changes_json),
    sources: JSON.parse(String(sources_json)),
    current,
  };
}
async function patchFor(
  e: Entity,
  input: unknown,
  before: Row,
  scopes?: string[],
) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    JSON.stringify(input).length > 200000
  )
    throw ApiError.validation("Invalid changes");
  const patch = input as Row;
  if (!Object.keys(patch).length) throw ApiError.validation("Empty proposal");
  const spec = CATALOG[e] as {
    strings: readonly string[];
    numbers?: readonly string[];
    arrays?: readonly string[];
    booleans?: readonly string[];
    refs: Record<string, string>;
    required: readonly string[];
  };
  const allowed = new Set([
    ...spec.strings,
    ...(spec.numbers ?? []),
    ...(spec.arrays ?? []),
    ...(spec.booleans ?? []),
    ...Object.keys(spec.refs),
    ...(e === "calendar" ? ["imageMetadata"] : []),
  ]);
  for (const [k, v] of Object.entries(patch)) {
    if (
      !allowed.has(k) ||
      ["slug", "language", "status"].includes(k) ||
      !Object.hasOwn(before, col(k))
    )
      throw ApiError.validation("Unsupported proposal field");
    if (k === "imageMetadata") {
      if (
        v !== null &&
        (typeof v !== "object" ||
          Array.isArray(v) ||
          (v as Row).origin !== "ai_generated" ||
          (v as Row).identityVerified !== false ||
          Object.keys(v).some(
            (x) => !["origin", "identityVerified"].includes(x),
          ))
      )
        throw ApiError.validation("Invalid image metadata");
    } else if (spec.numbers?.includes(k)) {
      if (typeof v !== "number" || !Number.isFinite(v))
        throw ApiError.validation("Invalid number");
    } else if (spec.booleans?.includes(k)) {
      if (typeof v !== "boolean") throw ApiError.validation("Invalid boolean");
    } else if (spec.arrays?.includes(k)) {
      if (
        !Array.isArray(v) ||
        v.length > 50 ||
        v.some((x) => typeof x !== "string" || !safeImage(x))
      )
        throw ApiError.validation("Invalid images");
    } else if (
      typeof v !== "string" &&
      !(
        v === null &&
        (k in spec.refs || ["seoTitle", "seoDescription"].includes(k))
      )
    )
      throw ApiError.validation("Invalid text");
    if (k.toLowerCase().endsWith("url") && v && !safeImage(String(v)))
      throw ApiError.validation("Unsafe URL");
    if (spec.required.includes(k) && !String(v ?? "").trim())
      throw ApiError.validation("Required field");
    if (k.startsWith("seo") && scopes) requireScope(scopes, "seo.write");
    if (k in spec.refs && v) {
      const linkedEntity = entity(spec.refs[k]);
      if (scopes) requireScope(scopes, linkedEntity + ".read");
      const linked = await adapters[linkedEntity].get(String(v));
      if (
        linked.language !== before.language ||
        (before.status === "published" && linked.status !== "published")
      )
        throw ApiError.validation("Invalid related record");
    }
  }
  return patch;
}
function safeImage(url: string) {
  return /^https:\/\/[^\s]+$/.test(url) || /^\/?media\/[^\s]+$/.test(url);
}
export async function aiProposals(request: Request, id?: string) {
  const access = await requireAiAccess(request),
    env = environment(request);
  if (request.method === "GET") {
    if (id) {
      const p = await get(id, env);
      if (p.created_by_ai_grant_id !== access.grant.id)
        throw ApiError.authorization("Own proposals only");
      requireScope(access.scopes, p.target_type + ".read");
      return view(p);
    }
    const rows = await d1All<Proposal>(
      "SELECT * FROM ai_proposals WHERE environment=? AND created_by_ai_grant_id=? ORDER BY created_at DESC LIMIT 200",
      env,
      access.grant.id,
    );
    return rows
      .filter((p) => access.scopes.includes(p.target_type + ".read"))
      .map((p) => view(p));
  }
  if (request.method !== "POST" || id)
    throw ApiError.authorization("AI cannot review proposals");
  const requestId = crypto.randomUUID();
  let activityType = "proposals",
    activityTarget: string | null = null;
  try {
    if (access.grant.mode !== "DRAFT_EDIT")
      throw ApiError.authorization("Draft edit required");
    const body = (await request.json()) as Row;
    if (!body || typeof body !== "object")
      throw ApiError.validation("Invalid proposal");
    const e = entity(body.targetType),
      targetId = String(body.targetId ?? "");
    requireScope(access.scopes, e + ".write");
    requireScope(access.scopes, e + ".read");
    const before = await raw(e, targetId);
    if (!before) throw ApiError.notFound("Target not found");
    activityType = e;
    activityTarget = String(before.id);
    const patch = await patchFor(e, body.patch, before, access.scopes);
    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 2000
    )
      throw ApiError.validation("Reason required");
    const sources = body.sources ?? [];
    if (
      !Array.isArray(sources) ||
      sources.length > 20 ||
      sources.some((x) => typeof x !== "string" || !/^https?:\/\//.test(x))
    )
      throw ApiError.validation("Invalid sources");
    const pid = crypto.randomUUID(),
      t = new Date().toISOString(),
      snapshot = JSON.stringify(before);
    await d1Batch([
      await proposalActivity(
        access.grant.id,
        access.grant.admin_user_id,
        e,
        targetId,
        "proposal.create",
        "success",
        requestId,
      ),
      await d1Prepare(
        "INSERT INTO ai_proposals(id,environment,target_type,target_id,target_version,target_snapshot_json,language,translation_group_id,proposed_changes_json,created_by_ai_grant_id,reason,sources_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        pid,
        env,
        e,
        targetId,
        await sha(snapshot),
        snapshot,
        before.language ?? null,
        before.translation_group_id ?? null,
        JSON.stringify(patch),
        access.grant.id,
        body.reason,
        JSON.stringify(sources),
        t,
      ),
      await d1Prepare(
        "INSERT INTO ai_proposal_audit VALUES(?,?,?,?,?)",
        crypto.randomUUID(),
        pid,
        access.grant.id,
        "created",
        t,
      ),
    ]);
    return view(await get(pid, env));
  } catch (error) {
    await logProposalFailure(
      access.grant.id,
      access.grant.admin_user_id,
      activityType,
      activityTarget,
      "proposal.create",
      requestId,
    );
    throw error;
  }
}
export async function humanProposals(request: Request, path: string[]) {
  const user = await browserAdmin(request),
    env = environment(request);
  if (request.method === "GET") {
    if (path.length === 1) {
      const p = await get(path[0], env);
      return {
        ...view(p, await adapters[p.target_type].get(p.target_id)),
        audit: await d1All(
          "SELECT actor_id,action,created_at FROM ai_proposal_audit WHERE proposal_id=? ORDER BY created_at",
          p.id,
        ),
      };
    }
    if (path.length) throw ApiError.notFound("Unsupported route");
    const q = new URL(request.url).searchParams;
    const offset = Math.max(0, Math.min(100000, Number(q.get("offset")) || 0));
    const rows = await d1All<Proposal>(
      "SELECT * FROM ai_proposals WHERE environment=? AND (?='' OR target_id=?) AND (?='' OR status=?) ORDER BY created_at DESC,id LIMIT 100 OFFSET ?",
      env,
      q.get("targetId") ?? "",
      q.get("targetId") ?? "",
      q.get("status") ?? "",
      q.get("status") ?? "",
      offset,
    );
    return rows.map((p) => view(p));
  }
  if (
    request.method !== "POST" ||
    path.length !== 2 ||
    !["apply", "reject"].includes(path[1])
  )
    throw ApiError.notFound("Unsupported route");
  const p = await get(path[0], env);
  const t = new Date().toISOString(),
    nonce = crypto.randomUUID(),
    action = path[1];
  try {
    if (p.status !== "pending")
      throw ApiError.conflict("Proposal already reviewed");
    if (action === "reject") {
      await d1Batch([
        await d1Prepare(
          "UPDATE ai_proposals SET status='rejected',reviewed_at=?,reviewed_by_admin_user_id=?,review_nonce=? WHERE id=? AND status='pending'",
          t,
          user.id,
          nonce,
          p.id,
        ),
        await auditStatement(p.id, user.id, t, nonce),
        await proposalActivity(
          p.created_by_ai_grant_id,
          user.id,
          p.target_type,
          p.target_id,
          "proposal.reject",
          "success",
          nonce,
          p.id,
        ),
      ]);
      const rejected = await get(p.id, env);
      if (rejected.review_nonce !== nonce)
        throw ApiError.conflict("Proposal already reviewed");
      return view(rejected);
    }
    const body = (await request.json()) as Row;
    if (body?.confirmation !== `APPLY ${p.id}`)
      throw ApiError.validation("Explicit proposal confirmation required");
    const before = JSON.parse(p.target_snapshot_json) as Row,
      patch = await patchFor(
        p.target_type,
        JSON.parse(p.proposed_changes_json),
        before,
      );
    const entries = Object.entries(before),
      table = adapters[p.target_type].table;
    // Compare every original column, including nulls, inside the same atomic D1 batch.
    // An edit with an unchanged timestamp is also detected. No status or publication transition.
    const match = `SELECT 1 FROM ${table} WHERE ${entries.map(([k]) => `"${k}" IS ?`).join(" AND ")}`;
    const values = entries.map(([, v]) => v);
    await d1Batch([
      await d1Prepare(
        `UPDATE ai_proposals SET status='stale',reviewed_at=?,reviewed_by_admin_user_id=?,review_nonce=? WHERE id=? AND status='pending' AND NOT EXISTS(${match})`,
        t,
        user.id,
        nonce,
        p.id,
        ...values,
      ),
      await d1Prepare(
        `UPDATE ${table} SET ${Object.keys(patch)
          .map((k) => col(k) + "=?")
          .join(
            ",",
          )},updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM ai_proposals WHERE id=? AND status='pending')`,
        ...Object.values(patch).map(value),
        t,
        p.target_id,
        p.id,
      ),
      await d1Prepare(
        "UPDATE ai_proposals SET status='applied',reviewed_at=?,reviewed_by_admin_user_id=?,applied_at=?,review_nonce=? WHERE id=? AND status='pending'",
        t,
        user.id,
        t,
        nonce,
        p.id,
      ),
      await auditStatement(p.id, user.id, t, nonce),
      await proposalActivity(
        p.created_by_ai_grant_id,
        user.id,
        p.target_type,
        p.target_id,
        "proposal.apply",
        "success",
        nonce,
        p.id,
      ),
    ]);
    const done = await get(p.id, env);
    if (done.status === "stale")
      throw ApiError.conflict(
        "Proposal stale: target changed; recreate proposal",
      );
    if (done.review_nonce !== nonce)
      throw ApiError.conflict("Proposal already reviewed");
    return view(done, await adapters[p.target_type].get(p.target_id));
  } catch (error) {
    await logProposalFailure(
      p.created_by_ai_grant_id,
      user.id,
      p.target_type,
      p.target_id,
      "proposal." + action,
      nonce,
    );
    throw error;
  }
}
async function auditStatement(
  id: string,
  user: string,
  t: string,
  nonce: string,
) {
  return d1Prepare(
    "INSERT INTO ai_proposal_audit(id,proposal_id,actor_id,action,created_at) SELECT ?,id,?,status,? FROM ai_proposals WHERE id=? AND review_nonce=?",
    crypto.randomUUID(),
    user,
    t,
    id,
    nonce,
  );
}

// The existing aggregate feed, not a second log system. Only trusted identifiers
// and fixed operation/result values: never request payloads, headers or errors.
async function proposalActivity(
  grantId: string,
  actorId: string,
  targetType: string,
  targetId: string | null,
  operation: string,
  result: string,
  requestId: string,
  reviewId: string | null = null,
) {
  return d1Prepare(
    `INSERT INTO ai_activity_log
 (id,grant_id,admin_user_id,tool_name,module,operation,target_type,target_id,request_id,status,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM ai_proposals WHERE id=? AND status='stale') THEN 'failed' ELSE ? END,?
 WHERE NOT EXISTS(SELECT 1 FROM ai_activity_log WHERE request_id=? AND operation=?)
 AND (? IS NULL OR EXISTS(SELECT 1 FROM ai_proposals WHERE id=? AND review_nonce=?))`,
    crypto.randomUUID(),
    grantId,
    actorId,
    operation,
    targetType,
    operation,
    targetType,
    targetId,
    requestId,
    reviewId,
    result,
    new Date().toISOString(),
    requestId,
    operation,
    reviewId,
    reviewId,
    requestId,
  );
}
async function logProposalFailure(
  grantId: string,
  actorId: string,
  targetType: string,
  targetId: string | null,
  operation: string,
  requestId: string,
) {
  // Preserve the original failure if storage itself is unavailable. A committed
  // success/stale activity for this request is never duplicated or overwritten.
  try {
    await d1Batch([
      await proposalActivity(
        grantId,
        actorId,
        targetType,
        targetId,
        operation,
        "failed",
        requestId,
      ),
    ]);
  } catch {
    /* No credential-bearing error logging. */
  }
}
