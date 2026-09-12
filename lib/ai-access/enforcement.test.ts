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
import { visualizer } from "./visualizer";
import { POST as upload } from "@/app/api/ai-access/media/upload/route";
const fixtures = {
  calendar: {
    title: "Fixture",
    slug: "fixture",
    language: "uk",
    dateNewStyle: "2026-09-11",
  },
  saints: { name: "Fixture", slug: "fixture", language: "uk" },
  icons: { title: "Fixture", slug: "fixture", language: "uk" },
  prayers: {
    title: "Fixture",
    slug: "fixture",
    language: "uk",
    text: "Technical fixture",
  },
  articles: {
    title: "Fixture",
    slug: "fixture",
    language: "uk",
    content: "Technical fixture",
  },
  gospel: {
    title: "Fixture",
    slug: "fixture",
    language: "uk",
    reference: "Fixture 1",
    text: "Technical fixture",
  },
  alphabet: { letter: "X", name: "Fixture", slug: "fixture", language: "uk" },
};
const allModules = [
  ...Object.keys(fixtures),
  "seo",
  "visualizer",
  "media",
  "r2",
  "terrain",
];
let token: string;
function request(method = "GET", body?: unknown) {
  return new Request("http://localhost/api/ai-access/content/prayers", {
    method,
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function access(mode = "DRAFT_EDIT", modules = allModules) {
  const g = await issueGrant("owner", "local", {
    mode,
    modules,
    durationMinutes: 15,
  });
  const t = await exchange(
    new Request("http://localhost/api/ai-access/exchange", {
      method: "POST",
      body: JSON.stringify({ pairingCode: g.pairingCode }),
    }),
  );
  token = t.accessToken;
  return g;
}
beforeEach(async () => {
  state.db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    state.db.exec(readFileSync("migrations/" + file, "utf8"));
  state.db.exec(
    "INSERT INTO admin_users(id,email,name,password_hash,role,active,created_at,updated_at) VALUES ('owner','fixture@example.invalid','Fixture','disabled','super_admin',1,'2026-01-01','2026-01-01')",
  );
  await access();
});
afterEach(() => {
  state.beforeUpdate = null;
  state.db.close();
});
describe("delegated server enforcement with real schemas and repositories", () => {
  it.each(Object.entries(fixtures))(
    "creates and updates %s only as draft",
    async (entity, payload) => {
      const created = (await content(request("POST", payload), entity)) as {
        id: string;
        status: string;
      };
      expect(created.status).toBe("draft");
      const field = ["saints", "alphabet"].includes(entity) ? "name" : "title";
      const updated = (await content(
        request("PUT", { [field]: "Changed fixture" }),
        entity,
        created.id,
      )) as Record<string, unknown>;
      expect(updated[field]).toBe("Changed fixture");
      expect(updated.status).toBe("draft");
    },
  );
  it("preserves icon gallery and honest image metadata; accepts nullable SEO", async () => {
    const icon = (await content(
      request("POST", {
        ...fixtures.icons,
        galleryUrls: ["https://example.invalid/image.png"],
      }),
      "icons",
    )) as { id: string };
    const changed = (await content(
      request("PUT", { galleryUrls: ["/media/fixture.png"] }),
      "icons",
      icon.id,
    )) as { galleryUrls: string[] };
    expect(changed.galleryUrls).toEqual(["/media/fixture.png"]);
    const day = (await content(
      request("POST", {
        ...fixtures.calendar,
        imageMetadata: { origin: "ai_generated", identityVerified: false },
      }),
      "calendar",
    )) as { id: string };
    const result = (await content(
      request("PUT", { seoTitle: null }),
      "calendar",
      day.id,
    )) as { seoTitle: unknown; imageMetadata: unknown };
    expect(result.seoTitle).toBeNull();
    expect(result.imageMetadata).toMatchObject({
      origin: "ai_generated",
      identityVerified: false,
    });
  });
  it("creates separate translations with a shared group and does not edit published source", async () => {
    const source = (await content(
      request("POST", fixtures.prayers),
      "prayers",
    )) as { id: string; translationGroupId: string };
    state.db
      .prepare("UPDATE church_prayers SET status='published' WHERE id=?")
      .run(source.id);
    const translated = (await content(
      request("POST", { ...fixtures.prayers, language: "ru" }),
      "prayers",
    )) as { translationGroupId: string; status: string };
    expect(translated.translationGroupId).toBe(source.translationGroupId);
    expect(translated.status).toBe("draft");
    await expect(
      content(request("PUT", { title: "forbidden" }), "prayers", source.id),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("atomically refuses a draft that another actor publishes before UPDATE", async () => {
    const row = (await content(request("POST", fixtures.gospel), "gospel")) as {
      id: string;
    };
    state.beforeUpdate = () =>
      state.db
        .prepare(
          "UPDATE church_gospel_readings SET status='published' WHERE id=?",
        )
        .run(row.id);
    await expect(
      content(request("PUT", { title: "Forbidden" }), "gospel", row.id),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      state.db
        .prepare("SELECT title FROM church_gospel_readings WHERE id=?")
        .get(row.id).title,
    ).toBe("Fixture");
  });
  it("rejects publication, forbidden fields, empty required fields and DELETE", async () => {
    const row = (await content(
      request("POST", fixtures.prayers),
      "prayers",
    )) as { id: string };
    for (const patch of [
      { status: "published" },
      { role: "super_admin" },
      { title: "" },
      { language: "ru" },
    ])
      await expect(
        content(request("PUT", patch), "prayers", row.id),
      ).rejects.toThrow();
    await expect(
      content(request("DELETE"), "prayers", row.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(content(request("POST", {}), "auth")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("requires module and SEO scopes, and records a credential-free denied action", async () => {
    await access("DRAFT_EDIT", ["prayers"]);
    await expect(content(request("GET"), "calendar")).rejects.toMatchObject({
      code: "AI_SCOPE_DENIED",
    });
    await access("DRAFT_EDIT", ["articles"]);
    await expect(
      content(
        request("POST", { ...fixtures.articles, seoTitle: "Fixture" }),
        "articles",
      ),
    ).rejects.toMatchObject({ code: "AI_SCOPE_DENIED" });
    const log = await activityList("owner", "local");
    expect(
      log.some((r: Record<string, unknown>) => r.status === "failed"),
    ).toBe(true);
    expect(JSON.stringify(log)).not.toContain(token);
  });
  it("READ_ONLY mode rejects writes even if a stored scope is overly broad", async () => {
    const g = await access("READ_ONLY", ["prayers"]);
    state.db
      .prepare("UPDATE ai_access_grants SET scopes_json=? WHERE id=?")
      .run(
        JSON.stringify(["prayers.write", "media.upload", "r2.upload"]),
        g.id,
      );
    await expect(
      content(request("POST", fixtures.prayers), "prayers"),
    ).rejects.toMatchObject({ status: 403 });
    expect((await upload(request("POST", {}))).status).toBe(403);
  });
  it("supports Visualizer drafts and logs the created entity ID, but refuses Base Earth", async () => {
    const row = (await visualizer(
      request("POST", {
        title: "Fixture",
        slug: "visual-fixture",
        language: "uk",
      }),
      "events",
    )) as { id: string };
    await visualizer(
      request("PUT", { summary: "Changed fixture" }),
      "events",
      row.id,
    );
    const logs = await activityList("owner", "local");
    expect(
      logs.some(
        (r: Record<string, unknown>) =>
          r.target_id === row.id &&
          r.target_type === "events" &&
          r.operation === "create",
      ),
    ).toBe(true);
    await expect(
      visualizer(request("POST", {}), "base-earth"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      visualizer(request("PUT", { status: "published" }), "events", row.id),
    ).rejects.toMatchObject({ status: 403 });
  });
});

it('calendar draft writes remain private with active Telegram scheduling',async()=>{
 state.db.exec('UPDATE telegram_autopost_global_settings SET enabled=1 WHERE id=1');
 const day=await content(request('POST',fixtures.calendar),'calendar') as {id:string;status:string};
 expect(day.status).toBe('draft');
 const prayer=await content(request('POST',{...fixtures.prayers,calendarDayId:day.id}),'prayers') as {status:string};
 expect(prayer.status).toBe('draft');
 expect(state.db.prepare('SELECT enabled FROM telegram_autopost_global_settings WHERE id=1').get().enabled).toBe(1);
});
