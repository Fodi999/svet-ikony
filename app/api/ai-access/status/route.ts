import { withErrors } from "@/lib/d1/errors";
import { requireAiAccess } from "@/lib/ai-access/service";
export async function GET(request: Request) {
  return withErrors(async () => {
    const a = await requireAiAccess(request);
    return Response.json(
      {
        connected: true,
        mode: a.grant.mode,
        scopes: a.scopes,
        expiresAt: a.grant.expires_at,
      },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
