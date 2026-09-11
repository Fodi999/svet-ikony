import { ApiError } from "@/lib/d1/errors";
export const MODULES = [
  "calendar",
  "saints",
  "icons",
  "prayers",
  "articles",
  "gospel",
  "alphabet",
  "seo",
  "media",
  "visualizer",
  "terrain",
  "r2",
] as const;
export type Mode = "READ_ONLY" | "DRAFT_EDIT";
export function grantPolicy(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw ApiError.validation("Invalid grant");
  const p = input as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (k) => !["mode", "modules", "durationMinutes"].includes(k),
    )
  )
    throw ApiError.validation("Unknown grant field");
  if (p.mode !== "READ_ONLY" && p.mode !== "DRAFT_EDIT")
    throw ApiError.validation("Publication access is unavailable");
  if (
    ![15, 30, 60, 120].includes(Number(p.durationMinutes)) ||
    typeof p.durationMinutes !== "number"
  )
    throw ApiError.validation("Invalid duration");
  if (
    !Array.isArray(p.modules) ||
    !p.modules.length ||
    p.modules.some((x) => !MODULES.includes(x))
  )
    throw ApiError.validation("Invalid modules");
  const scopes: string[] = [];
  for (const m of new Set(p.modules as string[])) {
    scopes.push(m + ".read");
    if (p.mode === "DRAFT_EDIT") {
      scopes.push(
        m + (["media", "r2", "terrain"].includes(m) ? ".upload" : ".write"),
      );
      if (m === "visualizer") scopes.push("visualizer.model.upload");
    }
  }
  return {
    mode: p.mode as Mode,
    modules: [...new Set(p.modules as string[])],
    scopes,
    durationMinutes: p.durationMinutes,
  };
}
export function environment(request: Request): "local" | "production" {
  const u = new URL(request.url);
  if (
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
    process.env.NODE_ENV !== "production"
  )
    return "local";
  if (u.protocol !== "https:") throw ApiError.authorization("HTTPS required");
  return "production";
}
export function requireScope(scopes: string[], scope: string) {
  if (!scopes.includes(scope))
    throw new ApiError(
      403,
      "AI_SCOPE_DENIED",
      "Required access was not granted",
    );
}
