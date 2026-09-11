import { withErrors } from "@/lib/d1/errors";
import { visualizer } from "@/lib/ai-access/visualizer";
async function handle(
  request: Request,
  { params }: { params: Promise<{ kind: string; id?: string[] }> },
) {
  return withErrors(async () => {
    const p = await params;
    return Response.json(await visualizer(request, p.kind, p.id?.join("/")), {
      headers: { "cache-control": "no-store" },
    });
  });
}
export { handle as GET, handle as POST, handle as PUT };
