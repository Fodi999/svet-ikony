import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { countUnreadIconOrders } from '@/lib/d1/repositories/orders';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const count = await countUnreadIconOrders();
    return Response.json({ count });
  });
}
