import { withErrors } from "@/lib/d1/errors";
import { exchange } from "@/lib/ai-access/service";
export async function POST(request: Request) {
  return withErrors(async () =>
    Response.json(await exchange(request), {
      headers: { "cache-control": "no-store" },
    }),
  );
}
