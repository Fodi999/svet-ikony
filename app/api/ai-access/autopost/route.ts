import { withErrors } from "@/lib/d1/errors";
import { requireAiAccess } from "@/lib/ai-access/service";
import { getAutopostSettings } from "@/lib/d1/repositories/telegram-autopost";
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireAiAccess(request);
    const s = await getAutopostSettings();
    return Response.json(
      { globalEnabled: s.globalEnabled, draftSourcesExcluded: true },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
