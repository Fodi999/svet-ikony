import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// @ts-expect-error Node24 built-in is not in this project's Node20 typings.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const state = vi.hoisted(() => ({
  db: null as unknown as DatabaseSync,
  beforeUpdate: null as null | (() => void),
}));
vi.mock("@/lib/d1/db", () => ({
  d1First: async (sql: string, ...p: unknown[]) =>
    state.db.prepare(sql).get(...p) ?? null,
  d1All: async (sql: string, ...p: unknown[]) =>
    state.db.prepare(sql).all(...p),
  d1Run: async (sql: string, ...p: unknown[]) => {
    if (sql.startsWith("UPDATE church_") && state.beforeUpdate) {
      const fn = state.beforeUpdate;
      state.beforeUpdate = null;
      fn();
    }
    return { meta: state.db.prepare(sql).run(...p) };
  },
  d1Prepare: async (sql: string, ...p: unknown[]) => ({ sql, p }),
  d1Batch: async (ss: { sql: string; p: unknown[] }[]) => {
    state.db.exec("BEGIN");
    try {
      const r = ss.map((s) => state.db.prepare(s.sql).run(...s.p));
      state.db.exec("COMMIT");
      return r;
    } catch (e) {
      state.db.exec("ROLLBACK");
      throw e;
    }
  },
}));
vi.mock("@/lib/d1/env", () => ({
  getMediaBucket: async () => ({
    head: async () => ({
      size: 100,
      httpMetadata: { contentType: "model/gltf-binary" },
    }),
  }),
}));
import { issueGrant, exchange, activityList } from "./service";
import { content } from "./content";
import { aiProposals, humanProposals } from "./proposals";
import { createSession } from "@/lib/d1/repositories/admin-sessions";
import { sha } from "./service";

vi.mock("@/lib/d1/auth", () => ({
  requireSuperAdmin: async (r: Request) => {
    if (r.headers.get("authorization") !== "Bearer fixture-service")
      throw new Error("Unauthorized");
  },
}));
let token: string, id: string;
function ai(method = "GET", body?: unknown) {
  return new Request("http://localhost/api/ai-access/proposals", {
    method,
    headers: { authorization: "Bearer " + token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function human(method = "GET", body?: unknown) {
  return new Request("http://localhost/api/admin/ai-proposals", {
    method,
    headers: {
      authorization: "Bearer fixture-service",
      "X-Admin-Session": "fixture-human",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function proposal(
  patch: unknown = {
    history: "Reviewed history",
    imageUrl: "https://example.invalid/image.png",
    seoTitle: "SEO",
    seoDescription: "Description",
  },
) {
  return (await aiProposals(
    ai("POST", {
      targetType: "calendar",
      targetId: id,
      patch,
      reason: "Fixture review",
      sources: [],
    }),
  )) as { id: string; status: string };
}
beforeEach(async () => {
  state.db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    state.db.exec(readFileSync("migrations/" + f, "utf8"));
  state.db.exec(
    "INSERT INTO admin_users(id,email,name,password_hash,role,active,created_at,updated_at) VALUES('owner','fixture@example.invalid','Fixture','disabled','super_admin',1,'2026-01-01','2026-01-01')",
  );
  await createSession({
    userId: "owner",
    tokenHash: await sha("fixture-human"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const g = await issueGrant("owner", "local", {
    mode: "DRAFT_EDIT",
    modules: ["calendar", "seo"],
    durationMinutes: 15,
  });
  const t = await exchange(
    new Request("http://localhost/api/ai-access/exchange", {
      method: "POST",
      body: JSON.stringify({ pairingCode: g.pairingCode }),
    }),
  );
  token = t.accessToken;
  const row = (await content(
    ai("POST", {
      title: "Fixture",
      slug: "fixture",
      dateNewStyle: "2026-09-06",
      language: "uk",
    }),
    "calendar",
  )) as { id: string };
  id = row.id;
  state.db
    .prepare("UPDATE church_calendar_days SET status='published' WHERE id=?")
    .run(id);
});
afterEach(() => {
  state.db.close();
});
it("AI stores a pending server proposal without changing published target", async () => {
  const p = await proposal();
  expect(p.status).toBe("pending");
  expect(
    state.db
      .prepare("SELECT history FROM church_calendar_days WHERE id=?")
      .get(id).history,
  ).toBe("");
  expect(((await aiProposals(ai())) as unknown[]).length).toBe(1);
});
it("AI cannot apply via either API, service credential alone cannot review", async () => {
  const p = await proposal();
  await expect(aiProposals(ai("POST", {}), p.id)).rejects.toThrow();
  await expect(
    humanProposals(ai("POST", {}), [p.id, "apply"]),
  ).rejects.toThrow();
  await expect(
    humanProposals(
      new Request("http://localhost", {
        method: "POST",
        headers: { authorization: "Bearer fixture-service" },
        body: "{}",
      }),
      [p.id, "apply"],
    ),
  ).rejects.toMatchObject({ status: 401 });
});
it("human applies whole diff, preserves publication, reads back and audits without credentials", async () => {
  const p = await proposal();
  expect(((await humanProposals(human(), [])) as unknown[]).length).toBe(1);
  const done = (await humanProposals(
    human("POST", { confirmation: "APPLY " + p.id }),
    [p.id, "apply"],
  )) as { status: string; current: { history: string; status: string } };
  expect(done.status).toBe("applied");
  expect(done.current.history).toBe("Reviewed history");
  expect(done.current.status).toBe("published");
  const audit = state.db
    .prepare("SELECT * FROM ai_proposal_audit WHERE proposal_id=?")
    .all(p.id);
  expect(audit.map((x: { action: string }) => x.action)).toEqual([
    "created",
    "applied",
  ]);
  for (const secret of [token, "fixture-human", "fixture-service"])
    expect(JSON.stringify(audit)).not.toContain(secret);
  await expect(
    humanProposals(human("POST", { confirmation: "APPLY " + p.id }), [
      p.id,
      "apply",
    ]),
  ).rejects.toThrow();
});
it("detects stale data even if updated_at did not change", async () => {
  const p = await proposal();
  state.db
    .prepare("UPDATE church_calendar_days SET history='Human edit' WHERE id=?")
    .run(id);
  await expect(
    humanProposals(human("POST", { confirmation: "APPLY " + p.id }), [
      p.id,
      "apply",
    ]),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    state.db.prepare("SELECT status FROM ai_proposals WHERE id=?").get(p.id)
      .status,
  ).toBe("stale");
  expect(
    state.db
      .prepare("SELECT history FROM church_calendar_days WHERE id=?")
      .get(id).history,
  ).toBe("Human edit");
});
it("reject records reviewer without touching target", async () => {
  const p = await proposal();
  const before = state.db
    .prepare("SELECT * FROM church_calendar_days WHERE id=?")
    .get(id);
  await humanProposals(human("POST", {}), [p.id, "reject"]);
  expect(
    state.db.prepare("SELECT * FROM church_calendar_days WHERE id=?").get(id),
  ).toEqual(before);
  expect(
    state.db
      .prepare(
        "SELECT status,reviewed_by_admin_user_id FROM ai_proposals WHERE id=?",
      )
      .get(p.id),
  ).toMatchObject({ status: "rejected", reviewed_by_admin_user_id: "owner" });
  await expect(
    humanProposals(human("POST", { confirmation: "APPLY " + p.id }), [
      p.id,
      "apply",
    ]),
  ).rejects.toThrow();
});
it("rejects unsafe fields, URLs and missing human confirmation", async () => {
  for (const patch of [
    { status: "published" },
    { slug: "new" },
    { imageUrl: "javascript:alert(1)" },
    { history: 42 },
  ])
    await expect(proposal(patch)).rejects.toThrow();
  const p = await proposal();
  await expect(
    humanProposals(human("POST", {}), [p.id, "apply"]),
  ).rejects.toMatchObject({ status: 400 });
});
it("other grants cannot read proposal; READ_ONLY cannot create", async () => {
  const p = await proposal();
  const g = await issueGrant("owner", "local", {
    mode: "READ_ONLY",
    modules: ["calendar"],
    durationMinutes: 15,
  });
  token = (
    await exchange(
      new Request("http://localhost/api/ai-access/exchange", {
        method: "POST",
        body: JSON.stringify({ pairingCode: g.pairingCode }),
      }),
    )
  ).accessToken;
  await expect(aiProposals(ai(), p.id)).rejects.toThrow();
  await expect(proposal()).rejects.toThrow();
});
it("rolls back target and proposal when audit insertion fails", async () => {
  const p = await proposal();
  state.db.exec(
    "CREATE TRIGGER fail_review_audit BEFORE INSERT ON ai_proposal_audit WHEN NEW.action='applied' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END",
  );
  await expect(
    humanProposals(human("POST", { confirmation: "APPLY " + p.id }), [
      p.id,
      "apply",
    ]),
  ).rejects.toThrow();
  expect(
    state.db
      .prepare("SELECT history FROM church_calendar_days WHERE id=?")
      .get(id).history,
  ).toBe("");
  expect(
    state.db.prepare("SELECT status FROM ai_proposals WHERE id=?").get(p.id)
      .status,
  ).toBe("pending");
});
it("a second competing proposal becomes stale after first is applied", async () => {
  const first = await proposal(),
    second = await proposal({ history: "Other change" });
  await humanProposals(human("POST", { confirmation: "APPLY " + first.id }), [
    first.id,
    "apply",
  ]);
  await expect(
    humanProposals(human("POST", { confirmation: "APPLY " + second.id }), [
      second.id,
      "apply",
    ]),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    state.db
      .prepare("SELECT history FROM church_calendar_days WHERE id=?")
      .get(id).history,
  ).toBe("Reviewed history");
});
it("a session belonging to a non-super-admin cannot review", async () => {
  const p = await proposal();
  state.db
    .prepare("UPDATE admin_users SET role='editor' WHERE id='owner'")
    .run();
  await expect(
    humanProposals(human("POST", {}), [p.id, "reject"]),
  ).rejects.toMatchObject({ status: 403 });
});
it("aggregates create/apply/reject with actor, grant, target and existing entries", async () => {
  const first = await proposal();
  await humanProposals(human("POST", { confirmation: "APPLY " + first.id }), [
    first.id,
    "apply",
  ]);
  const second = await proposal({ history: "Reject this" });
  await humanProposals(human("POST", {}), [second.id, "reject"]);
  const rows = (await activityList("owner", "local")) as Array<
    Record<string, unknown>
  >;
  const entries = rows.filter((r) =>
    String(r.operation).startsWith("proposal."),
  );
  expect(entries).toHaveLength(4);
  for (const r of entries) {
    expect(r).toMatchObject({
      target_type: "calendar",
      target_id: id,
      admin_user_id: "owner",
      status: "success",
    });
    expect(r.grant_id).toBeTruthy();
  }
  expect(entries.map((r) => r.operation).sort()).toEqual([
    "proposal.apply",
    "proposal.create",
    "proposal.create",
    "proposal.reject",
  ]);
  expect(
    rows.some((r) => r.operation === "create" && r.module === "calendar"),
  ).toBe(true);
});
it("records validation failures and stale apply once, without credential-bearing request data", async () => {
  const secret = "fixture-sensitive-value";
  await expect(
    proposal({
      history: {
        Authorization: secret,
        cookie: secret,
        token,
        pairingCode: secret,
      },
    }),
  ).rejects.toThrow();
  const p = await proposal();
  state.db
    .prepare("UPDATE church_calendar_days SET history='changed' WHERE id=?")
    .run(id);
  await expect(
    humanProposals(human("POST", { confirmation: "APPLY " + p.id }), [
      p.id,
      "apply",
    ]),
  ).rejects.toMatchObject({ status: 409 });
  const rows = (await activityList("owner", "local")) as Array<
    Record<string, unknown>
  >;
  expect(
    rows.filter(
      (r) => r.operation === "proposal.create" && r.status === "failed",
    ),
  ).toHaveLength(1);
  expect(
    rows.filter(
      (r) => r.operation === "proposal.apply" && r.status === "failed",
    ),
  ).toHaveLength(1);
  for (const value of [
    secret,
    token,
    "fixture-human",
    "fixture-service",
    "Authorization",
    "pairingCode",
  ])
    expect(JSON.stringify(rows)).not.toContain(value);
});
it("reviewer and owner see human activity, unrelated users/environments do not", async () => {
  const p = await proposal();
  state.db.exec(
    "INSERT INTO admin_users(id,email,name,password_hash,role,active,created_at,updated_at) VALUES('reviewer','reviewer@example.invalid','Reviewer','disabled','super_admin',1,'2026-01-01','2026-01-01')",
  );
  await createSession({
    userId: "reviewer",
    tokenHash: await sha("reviewer-session"),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const request = new Request("http://localhost/api/admin/ai-proposals", {
    method: "POST",
    headers: {
      authorization: "Bearer fixture-service",
      "X-Admin-Session": "reviewer-session",
    },
    body: "{}",
  });
  await humanProposals(request, [p.id, "reject"]);
  for (const user of ["owner", "reviewer"])
    expect(
      (
        (await activityList(user, "local")) as Array<Record<string, unknown>>
      ).some(
        (r) =>
          r.operation === "proposal.reject" && r.admin_user_id === "reviewer",
      ),
    ).toBe(true);
  expect(await activityList("unrelated", "local")).toEqual([]);
  expect(await activityList("reviewer", "production")).toEqual([]);
  await expect(
    humanProposals(request, [p.id, "reject"]),
  ).rejects.toThrow();
  expect(
    (
      (await activityList("reviewer", "local")) as Array<
        Record<string, unknown>
      >
    ).filter((r) => r.operation === "proposal.reject" && r.status === "failed"),
  ).toHaveLength(1);
});
it("general activity failure rolls back successful review and retains specialized audit", async () => {
  const p = await proposal();
  state.db.exec(
    "CREATE TRIGGER fail_general_activity BEFORE INSERT ON ai_activity_log WHEN NEW.operation='proposal.apply' AND NEW.status='success' BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
  );
  await expect(
    humanProposals(human("POST", { confirmation: "APPLY " + p.id }), [
      p.id,
      "apply",
    ]),
  ).rejects.toThrow();
  expect(
    state.db.prepare("SELECT status FROM ai_proposals WHERE id=?").get(p.id)
      .status,
  ).toBe("pending");
  expect(
    state.db
      .prepare("SELECT history FROM church_calendar_days WHERE id=?")
      .get(id).history,
  ).toBe("");
  expect(
    state.db
      .prepare("SELECT action FROM ai_proposal_audit WHERE proposal_id=?")
      .all(p.id),
  ).toEqual([{ action: "created" }]);
  expect(
    (
      (await activityList("owner", "local")) as Array<Record<string, unknown>>
    ).some((r) => r.operation === "proposal.apply" && r.status === "failed"),
  ).toBe(true);
});
