import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getAutopostSettings, updateAutopostSettings, type AutopostSettingsUpdateInput } from '@/lib/d1/repositories/telegram-autopost';

export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await getAutopostSettings());
  });
}

export async function PUT(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = (await request.json()) as AutopostSettingsUpdateInput;
    return Response.json(await updateAutopostSettings(payload));
  });
}
