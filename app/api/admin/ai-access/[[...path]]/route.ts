import { withErrors, ApiError } from "@/lib/d1/errors";
import {
  browserAdmin,
  issueGrant,
  listGrants,
  revokeGrant,
  renewCode,
  activityList,
} from "@/lib/ai-access/service";
import { environment } from "@/lib/ai-access/policy";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return withErrors(async () => {
    const user = await browserAdmin(request),
      env = environment(request),
      p = (await params).path ?? [];
    let result: unknown;
    if (request.method === "GET" && p.join("/") === "grants")
      result = await listGrants(user.id, env);
    else if (request.method === "GET" && p.join("/") === "activity")
      result = await activityList(user.id, env);
    else if (request.method === "POST" && p.join("/") === "grants")
      result = await issueGrant(user.id, env, await request.json());
    else if (
      request.method === "POST" &&
      p.length === 3 &&
      p[0] === "grants" &&
      p[2] === "revoke"
    )
      result = await revokeGrant(p[1], user.id, env);
    else if (
      request.method === "POST" &&
      p.length === 3 &&
      p[0] === "grants" &&
      p[2] === "pairing"
    )
      result = await renewCode(p[1], user.id, env);
    else throw ApiError.notFound("Unsupported AI access route");
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  });
}
export { handle as GET, handle as POST };
