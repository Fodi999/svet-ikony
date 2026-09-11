import { withErrors } from "@/lib/d1/errors";
import { humanProposals } from "@/lib/ai-access/proposals";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return withErrors(async () => {
    const path = (await params).path ?? [];
    const result = await humanProposals(request, path);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  });
}
export { handle as GET, handle as POST };
