import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// @ts-expect-error Node24 built-in is not in the project's Node20 typings.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mock = vi.hoisted(() => ({
  db: null as unknown as DatabaseSync,
  session: {
    outcome: "valid",
    user: { id: "owner", role: "super_admin" },
  } as Record<string, unknown>,
}));
vi.mock("@/lib/d1/db", () => ({
  d1First: async (sql: string, ...p: unknown[]) =>
    mock.db.prepare(sql).get(...(p as [])) ?? null,
  d1All: async (sql: string, ...p: unknown[]) =>
    mock.db.prepare(sql).all(...(p as [])),
  d1Run: async (sql: string, ...p: unknown[]) => ({
    meta: mock.db.prepare(sql).run(...(p as [])),
  }),
  d1Prepare: async (sql: string, ...p: unknown[]) => ({ sql, p }),
  d1Batch: async (statements: { sql: string; p: unknown[] }[]) => {
    mock.db.exec("BEGIN");
    try {
      const r = statements.map((s) =>
        mock.db.prepare(s.sql).run(...(s.p as [])),
      );
      mock.db.exec("COMMIT");
      return r;
    } catch (e) {
      mock.db.exec("ROLLBACK");
      throw e;
    }
  },
}));
vi.mock("@/lib/d1/auth", () => ({
  requireSuperAdmin: async (r: Request) => {
    if (r.headers.get("authorization") !== "Bearer fixture")
      throw Error("unauthenticated");
  },
}));
vi.mock("@/lib/d1/repositories/admin-sessions", () => ({
  validateSession: async () => mock.session,
}));
import {
  issueGrant,
  exchange,
  requireAiAccess,
  revokeGrant,
  renewCode,
  activity,
  activityList,
  browserAdmin,
  sha,
} from "./service";
import { grantPolicy } from "./policy";
const req = (token?: string) =>
  new Request("http://localhost:3000/api/ai-access/status", {
    headers: token ? { authorization: "Bearer " + token } : {},
  });
const pair = (code: string) =>
  exchange(
    new Request("http://localhost:3000/api/ai-access/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: code }),
    }),
  );
async function grant(mode = "DRAFT_EDIT") {
  return issueGrant("owner", "local", {
    mode,
    modules: ["calendar", "prayers"],
    durationMinutes: 30,
  });
}
beforeEach(() => {
  mock.db = new DatabaseSync(":memory:");
  mock.db.exec(
    "CREATE TABLE admin_users(id TEXT PRIMARY KEY,role TEXT,active INTEGER); INSERT INTO admin_users VALUES ('owner','super_admin',1);",
  );
  mock.db.exec(readFileSync("migrations/0020_ai_delegated_access.sql", "utf8"));
  mock.session = {
    outcome: "valid",
    user: { id: "owner", role: "super_admin" },
  };
});
afterEach(() => mock.db.close());
describe("delegated access lifecycle using real SQLite migration", () => {
  it("allows authenticated super admin only", async () => {
    await expect(browserAdmin(req())).rejects.toThrow();
    const r = new Request("http://localhost", {
      headers: {
        authorization: "Bearer fixture",
        "X-Admin-Session": "human-fixture",
      },
    });
    expect((await browserAdmin(r)).id).toBe("owner");
    mock.session = { outcome: "valid", user: { id: "owner", role: "viewer" } };
    await expect(browserAdmin(r)).rejects.toMatchObject({ status: 403 });
    mock.session = { outcome: "expired" };
    await expect(browserAdmin(r)).rejects.toMatchObject({ status: 401 });
  });
  it("validates mode, duration, modules and client-supplied identity", () => {
    for (const p of [
      { mode: "PUBLISH", modules: ["prayers"], durationMinutes: 15 },
      { mode: "DRAFT_EDIT", modules: ["auth.admin"], durationMinutes: 30 },
      { mode: "READ_ONLY", modules: ["prayers"], durationMinutes: 121 },
      {
        mode: "READ_ONLY",
        modules: ["prayers"],
        durationMinutes: 30,
        admin_user_id: "attacker",
      },
    ])
      expect(() => grantPolicy(p)).toThrow();
    expect(
      grantPolicy({
        mode: "READ_ONLY",
        modules: ["prayers"],
        durationMinutes: 15,
      }).scopes,
    ).toEqual(["prayers.read"]);
  });
  it("exchanges once, stores hashes only, and enforces scopes", async () => {
    const g = await grant();
    const token = await pair(g.pairingCode);
    expect(token.mode).toBe("DRAFT_EDIT");
    const access = await requireAiAccess(
      req(token.accessToken),
      "prayers.write",
    );
    expect(access.grant.id).toBe(g.id);
    await expect(
      requireAiAccess(req(token.accessToken), "saints.write"),
    ).rejects.toThrow();
    await expect(pair(g.pairingCode)).rejects.toThrow();
    const stored = mock.db
      .prepare("SELECT token_hash FROM ai_access_tokens")
      .get()!;
    expect(stored.token_hash).toBe(await sha(token.accessToken));
    expect(
      JSON.stringify(mock.db.prepare("SELECT * FROM ai_pairing_codes").all()),
    ).not.toContain(g.pairingCode);
  });
  it("rejects incorrect and expired codes and code regeneration invalidates prior code", async () => {
    await expect(pair("AAAA-BBBB-CCCC")).rejects.toThrow();
    const g = await grant();
    const next = await renewCode(g.id, "owner", "local");
    await expect(pair(g.pairingCode)).rejects.toThrow();
    mock.db.exec("UPDATE ai_pairing_codes SET expires_at='2000-01-01'");
    await expect(pair(next.pairingCode)).rejects.toThrow();
  });
  it("enforces exchange rate limits", async () => {
    for (let i = 0; i < 20; i++)
      await expect(pair("AAAA-BBBB-CCCC")).rejects.toThrow();
    await expect(pair("AAAA-BBBB-CCCC")).rejects.toMatchObject({ status: 429 });
  });
  it("rejects expired access and environment mismatch", async () => {
    const g = await grant(),
      t = await pair(g.pairingCode);
    await expect(
      requireAiAccess(
        new Request("https://svetikony.com/api/ai-access/status", {
          headers: { authorization: "Bearer " + t.accessToken },
        }),
      ),
    ).rejects.toThrow(/Environment/);
    mock.db.exec("UPDATE ai_access_tokens SET expires_at='2000-01-01'");
    await expect(requireAiAccess(req(t.accessToken))).rejects.toThrow(
      /expired/,
    );
  });
  it("revocation immediately invalidates token and pending codes", async () => {
    const g = await grant(),
      t = await pair(g.pairingCode),
      next = await renewCode(g.id, "owner", "local");
    await revokeGrant(g.id, "owner", "local");
    await expect(requireAiAccess(req(t.accessToken))).rejects.toMatchObject({
      code: "AI_ACCESS_REVOKED",
    });
    await expect(pair(next.pairingCode)).rejects.toThrow();
  });
  it("records safe activity without auth headers or tokens", async () => {
    const g = await grant(),
      t = await pair(g.pairingCode),
      a = await requireAiAccess(req(t.accessToken));
    await activity(
      a,
      "prayers",
      "read",
      "fixture",
      "success",
      crypto.randomUUID(),
    );
    const rows = await activityList("owner", "local");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(t.accessToken);
    expect(JSON.stringify(rows)).not.toContain("authorization");
  });
  it("disabled owners cannot use or exchange delegated access", async () => {
    const g = await grant(),
      t = await pair(g.pairingCode),
      g2 = await grant();
    mock.db.exec("UPDATE admin_users SET active=0");
    await expect(requireAiAccess(req(t.accessToken))).rejects.toThrow(
      /revoked/,
    );
    await expect(pair(g2.pairingCode)).rejects.toThrow();
  });
});
