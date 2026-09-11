import { withErrors } from "@/lib/d1/errors";
import { content } from "@/lib/ai-access/content";
async function handle(
  request: Request,
  { params }: { params: Promise<{ entity: string; id?: string[] }> },
) {
  return withErrors(async () => {
    const p = await params;
    return Response.json(await content(request, p.entity, p.id?.join("/")), {
      headers: { "cache-control": "no-store" },
    });
  });
}
export { handle as GET, handle as POST, handle as PUT };
