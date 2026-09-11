import { withErrors, ApiError } from "@/lib/d1/errors";
import { aiProposals } from "@/lib/ai-access/proposals";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return withErrors(async () => {
    const path = (await params).path ?? [];
    if (path.length > 1) throw ApiError.authorization("AI review disabled");
    const result = await aiProposals(request, path[0]);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  });
}
export { handle as GET, handle as POST };
