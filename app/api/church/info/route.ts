import { withErrors } from '@/lib/d1/errors';
import { getChurchInfo } from '@/lib/d1/repositories/churchInfo';

/** Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/info`. */
export async function GET() {
  return withErrors(async () => {
    const info = await getChurchInfo();
    return Response.json(info);
  });
}
