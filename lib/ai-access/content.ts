import {
  listCalendarDays,
  getCalendarDay,
  createCalendarDay,
} from "@/lib/d1/repositories/calendarDays";
import {
  listSaints,
  getSaint,
  createSaint,
} from "@/lib/d1/repositories/saints";
import { listIcons, getIcon, createIcon } from "@/lib/d1/repositories/icons";
import {
  listPrayers,
  getPrayer,
  createPrayer,
} from "@/lib/d1/repositories/prayers";
import {
  listArticles,
  getArticle,
  createArticle,
} from "@/lib/d1/repositories/articles";
import {
  listGospel,
  getGospel,
  createGospel,
} from "@/lib/d1/repositories/gospel";
import {
  listAlphabetLetters,
  getAlphabetLetter,
  createAlphabetLetter,
} from "@/lib/d1/repositories/alphabet";
import { d1Run } from "@/lib/d1/db";
import { ApiError } from "@/lib/d1/errors";
import { CATALOG } from "./catalog";
import { requireScope } from "./policy";
import { requireAiAccess, activity } from "./service";
export const adapters = {
  calendar: {
    list: listCalendarDays,
    get: getCalendarDay,
    create: createCalendarDay,
    table: "church_calendar_days",
  },
  saints: {
    list: listSaints,
    get: getSaint,
    create: createSaint,
    table: "church_saints",
  },
  icons: {
    list: listIcons,
    get: getIcon,
    create: createIcon,
    table: "church_icons",
  },
  prayers: {
    list: listPrayers,
    get: getPrayer,
    create: createPrayer,
    table: "church_prayers",
  },
  articles: {
    list: listArticles,
    get: getArticle,
    create: createArticle,
    table: "church_articles",
  },
  gospel: {
    list: listGospel,
    get: getGospel,
    create: createGospel,
    table: "church_gospel_readings",
  },
  alphabet: {
    list: listAlphabetLetters,
    get: getAlphabetLetter,
    create: createAlphabetLetter,
    table: "church_alphabet_letters",
  },
};
type Entity = keyof typeof adapters;
export async function content(request: Request, entity: string, id?: string) {
  if (!Object.hasOwn(adapters, entity))
    throw ApiError.notFound("Unsupported module");
  if (
    !["GET", "POST", "PUT"].includes(request.method) ||
    (request.method === "POST" && id) ||
    (request.method === "PUT" && !id)
  )
    throw ApiError.authorization("Operation unavailable");
  if (id && !/^[a-zA-Z0-9_-]{1,120}$/.test(id))
    throw ApiError.validation("Invalid ID");
  const e = entity as Entity,
    adapter = adapters[e],
    write = request.method !== "GET",
    a = await requireAiAccess(request, e + (write ? ".write" : ".read")),
    op = write ? (id ? "update" : "create") : "read",
    requestId = crypto.randomUUID();
  try {
    let result: unknown;
    if (!write) result = id ? await adapter.get(id) : await adapter.list();
    else {
      if (a.grant.mode !== "DRAFT_EDIT")
        throw ApiError.authorization("Draft edit access required");
      const raw = await request.json();
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        JSON.stringify(raw).length > 500000
      )
        throw ApiError.validation("Invalid payload");
      const p = raw as Record<string, unknown>,
        spec = CATALOG[e] as {
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
        ...(e === "calendar" ? ["imageMetadata"] : []),
        ...(spec.booleans ?? []),
        ...Object.keys(spec.refs),
        "status",
      ]);
      for (const [k, v] of Object.entries(p)) {
        if (!allowed.has(k)) throw ApiError.validation("Unsupported field");
        if (k === "status") {
          if (v !== "draft")
            throw ApiError.authorization("Publication disabled");
          continue;
        }
        if (e === "calendar" && k === "imageMetadata") {
          if (
            v !== null &&
            (typeof v !== "object" ||
              Array.isArray(v) ||
              (v as Record<string, unknown>).origin !== "ai_generated" ||
              (v as Record<string, unknown>).identityVerified !== false ||
              Object.keys(v).some(
                (key) => !["origin", "identityVerified"].includes(key),
              ))
          )
            throw ApiError.validation("Invalid AI image metadata");
        } else if (spec.arrays?.includes(k)) {
          if (
            !Array.isArray(v) ||
            v.length > 50 ||
            v.some(
              (url) =>
                typeof url !== "string" ||
                !/^(https:\/\/|\/?media\/)/.test(url),
            )
          )
            throw ApiError.validation("Invalid gallery URLs");
        } else if (
          e === "calendar" &&
          ["seoTitle", "seoDescription"].includes(k) &&
          v === null
        ) {
          continue;
        } else if (spec.numbers?.includes(k)) {
          if (v !== null && (typeof v !== "number" || !Number.isFinite(v)))
            throw ApiError.validation("Invalid number");
        } else if (spec.booleans?.includes(k)) {
          if (typeof v !== "boolean")
            throw ApiError.validation("Invalid boolean");
        } else if (typeof v !== "string" && !(v === null && k in spec.refs))
          throw ApiError.validation("Invalid text");
      }
      if ("language" in p && !["uk", "ru", "en"].includes(String(p.language)))
        throw ApiError.validation("Invalid language");
      if (Object.keys(p).some((k) => k.startsWith("seo")))
        requireScope(a.scopes, "seo.write");
      const previous = id ? await adapter.get(id) : null;
      if (previous && previous.status !== "draft")
        throw ApiError.authorization("Only drafts may be edited");
      if (
        previous &&
        (("language" in p && p.language !== previous.language) ||
          ("slug" in p && p.slug !== previous.slug))
      )
        throw ApiError.validation(
          "Draft language and slug cannot be changed by AI",
        );
      const merged = { ...previous, ...p } as Record<string, unknown>;
      for (const field of spec.required)
        if (typeof merged[field] !== "string" || !String(merged[field]).trim())
          throw ApiError.validation("Required content field missing");
      for (const [field, target] of Object.entries(spec.refs)) {
        if (p[field]) {
          if (!Object.hasOwn(adapters, target))
            throw ApiError.validation("Unsupported relationship");
          requireScope(a.scopes, target + ".read");
          const linked = await adapters[target as Entity].get(String(p[field]));
          if (linked.language !== merged.language)
            throw ApiError.validation("Relationship language mismatch");
        }
      }
      // Public bot commands, content-plan and autopost facts accept published sources only.
      // Draft creation no longer requires switching off the user's Telegram schedule.
      p.status = "draft";
      if (!id) {
        for (const field of spec.required)
          if (typeof p[field] !== "string" || !String(p[field]).trim())
            throw ApiError.validation("Required content field missing");
        result = await adapter.create(p);
      } else {
        const entries = Object.entries(p).filter(([k]) => k !== "status");
        if (entries.length) {
          const column = (k: string) =>
            k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
          const values = entries.map(([, v]) =>
            typeof v === "boolean"
              ? Number(v)
              : v !== null && typeof v === "object"
                ? JSON.stringify(v)
                : v,
          );
          const r = await d1Run(
            `UPDATE ${adapter.table} SET ${entries.map(([k]) => column(k) + "=?").join(",")},updated_at=? WHERE id=? AND status='draft'`,
            ...values,
            new Date().toISOString(),
            id,
          );
          if (!r.meta.changes)
            throw ApiError.conflict("Draft changed; reload before retry");
        }
        result = await adapter.get(id);
      }
    }
    const target =
      id ??
      (result && typeof result === "object" && "id" in result
        ? String(result.id)
        : null);
    await activity(a, e, op, target, "success", requestId);
    return result;
  } catch (error) {
    await activity(a, e, op, id ?? null, "failed", requestId);
    throw error;
  }
}
