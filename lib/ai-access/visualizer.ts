import {
  listVisualizerEvents,
  getVisualizerEvent,
  createVisualizerEvent,
  type ChurchVisualizerEventPayload,
} from "@/lib/d1/repositories/visualizerEvents";
import {
  listVisualizerModels,
  getVisualizerModel,
  createVisualizerModel,
  type ChurchVisualizerModelPayload,
  getBaseEarthModel,
} from "@/lib/d1/repositories/visualizerModels";
import { d1First, d1Run } from "@/lib/d1/db";
import { getMediaBucket } from "@/lib/d1/env";
import { validateEvent } from "@/lib/visualizer/validate-event";
import { ApiError } from "@/lib/d1/errors";
import { requireAiAccess, activity } from "./service";
import { requireScope } from "./policy";
export async function visualizer(request: Request, kind: string, id?: string) {
  const write = request.method !== "GET",
    a = await requireAiAccess(
      request,
      write ? "visualizer.write" : "visualizer.read",
    );
  if (!["events", "models", "base-earth"].includes(kind))
    throw ApiError.notFound("Unknown resource");
  if (id && !/^[a-zA-Z0-9_-]{1,120}$/.test(id))
    throw ApiError.validation("Invalid ID");
  const requestId = crypto.randomUUID();
  try {
    let result: unknown;
    if (!write) {
      result =
        kind === "base-earth"
          ? await getBaseEarthModel()
          : kind === "events"
            ? id
              ? await getVisualizerEvent(id)
              : await listVisualizerEvents()
            : id
              ? await getVisualizerModel(id)
              : await listVisualizerModels();
    } else {
      if (
        a.grant.mode !== "DRAFT_EDIT" ||
        !["POST", "PUT"].includes(request.method) ||
        kind === "base-earth" ||
        (request.method === "POST" && id) ||
        (request.method === "PUT" && !id)
      )
        throw ApiError.authorization("Operation unavailable");
      const raw = await request.json();
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        JSON.stringify(raw).length > 500000
      )
        throw ApiError.validation("Invalid payload");
      const p = raw as Record<string, unknown>;
      if (kind === "events") {
        const allowed = [
          "slug",
          "language",
          "title",
          "summary",
          "description",
          "eventType",
          "chronologyType",
          "era",
          "calendarEra",
          "yearStart",
          "yearEnd",
          "century",
          "displayDate",
          "sortYear",
          "locationName",
          "latitude",
          "longitude",
          "calendarDayId",
          "status",
          "isFeatured",
        ];
        if (
          Object.keys(p).some((k) => !allowed.includes(k)) ||
          (p.status && p.status !== "draft")
        )
          throw ApiError.authorization("Only draft fields allowed");
        p.status = "draft";
        const current = id ? await getVisualizerEvent(id) : null;
        if (
          current &&
          (current.status !== "draft" ||
            (p.slug && p.slug !== current.slug) ||
            (p.language && p.language !== current.language))
        )
          throw ApiError.authorization(
            "Only existing draft identity may be edited",
          );
        if (p.calendarDayId || current?.calendarDayId)
          throw ApiError.authorization("AI Visualizer calendar links deferred");
        validateEvent({ ...current, ...p } as ChurchVisualizerEventPayload);
        if (
          typeof p.isFeatured !== "undefined" &&
          typeof p.isFeatured !== "boolean"
        )
          throw ApiError.validation("Invalid featured flag");
        if (!id)
          result = await createVisualizerEvent(
            p as ChurchVisualizerEventPayload,
          );
        else {
          const entries = Object.entries(p).filter(([k]) => k !== "status");
          if (entries.length) {
            const r = await d1Run(
              `UPDATE visualizer_events SET ${entries.map(([k]) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()) + "=?").join(",")},updated_at=? WHERE id=? AND status='draft'`,
              ...entries.map(([, v]) =>
                typeof v === "boolean" ? Number(v) : v,
              ),
              new Date().toISOString(),
              id,
            );
            if (!r.meta.changes) throw ApiError.conflict("Draft changed");
          }
          result = await getVisualizerEvent(id);
        }
      } else {
        const allowed = [
          "eventGroupId",
          "title",
          "r2Key",
          "filename",
          "mimeType",
          "fileSize",
          "isBaseEarth",
          "sortOrder",
        ];
        if (Object.keys(p).some((k) => !allowed.includes(k)) || p.isBaseEarth)
          throw ApiError.authorization("Base Earth changes unavailable");
        if (
          (p.title !== undefined && typeof p.title !== "string") ||
          (p.filename !== undefined && typeof p.filename !== "string") ||
          (p.eventGroupId !== undefined &&
            p.eventGroupId !== null &&
            typeof p.eventGroupId !== "string") ||
          (p.sortOrder !== undefined && !Number.isSafeInteger(p.sortOrder))
        )
          throw ApiError.validation("Invalid model metadata");
        requireScope(a.scopes, "visualizer.model.upload");
        const current = id ? await getVisualizerModel(id) : null;
        if (current?.isBaseEarth)
          throw ApiError.authorization("Base Earth changes unavailable");
        const key = p.r2Key ?? current?.r2Key;
        if (
          typeof key !== "string" ||
          !/^media\/visualizer\/[a-zA-Z0-9_-]+\/model\/[a-f0-9-]+\.glb$/.test(
            key,
          )
        )
          throw ApiError.validation("Invalid model key");
        requireScope(a.scopes, "r2.read");
        const object = await (await getMediaBucket()).head(key);
        if (!object || object.httpMetadata?.contentType !== "model/gltf-binary")
          throw ApiError.validation("Uploaded GLB missing");
        for (const group of [current?.eventGroupId, p.eventGroupId])
          if (group) {
            const rows = await d1First<{ total: number; published: number }>(
              "SELECT count(*) AS total,sum(CASE WHEN status!='draft' THEN 1 ELSE 0 END) AS published FROM visualizer_events WHERE translation_group_id=?",
              group,
            );
            if (!rows?.total || rows.published)
              throw ApiError.authorization("All group events must be drafts");
          }
        if (!id && p.eventGroupId)
          throw ApiError.validation(
            "Create a standalone model, then attach to a draft group",
          );
        if (!id)
          result = await createVisualizerModel({
            ...p,
            r2Key: key,
            fileSize: object.size,
            mimeType: "model/gltf-binary",
            isBaseEarth: false,
          } as ChurchVisualizerModelPayload);
        else {
          if (
            Object.keys(p).some(
              (k) => !["eventGroupId", "title", "sortOrder"].includes(k),
            )
          )
            throw ApiError.validation("Model replacement unavailable");
          const entries = Object.entries(p);
          if (entries.length) {
            const r = await d1Run(
              `UPDATE visualizer_models SET ${entries.map(([k]) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()) + "=?").join(",")},updated_at=? WHERE id=? AND is_base_earth=0 AND NOT EXISTS(SELECT 1 FROM visualizer_events WHERE translation_group_id=visualizer_models.event_group_id AND status!='draft') AND NOT EXISTS(SELECT 1 FROM visualizer_events WHERE translation_group_id=? AND status!='draft')`,
              ...entries.map(([, v]) => v),
              new Date().toISOString(),
              id,
              p.eventGroupId ?? null,
            );
            if (!r.meta.changes) throw ApiError.conflict("Model group changed");
          }
          result = await getVisualizerModel(id);
        }
      }
    }
    await activity(
      a,
      "visualizer",
      write ? (id ? "update" : "create") : "read",
      id ??
        (result && typeof result === "object" && "id" in result
          ? String(result.id)
          : null),
      "success",
      requestId,
      kind,
    );
    return result;
  } catch (e) {
    await activity(
      a,
      "visualizer",
      write ? (id ? "update" : "create") : "read",
      id ?? null,
      "failed",
      requestId,
      kind,
    );
    throw e;
  }
}
