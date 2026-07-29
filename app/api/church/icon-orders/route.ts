import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { createIconOrder, type CreateIconOrderPayload } from '@/lib/d1/repositories/orders';

/** Public endpoint — no admin auth, matches
 * assistant/src/interfaces/http/church_orders.rs public_create_icon_order. */
export async function POST(request: NextRequest) {
  return withErrors(async () => {
    const payload = await request.json() as CreateIconOrderPayload;
    const result = await createIconOrder(payload, request.headers);
    return Response.json(result, { status: 201 });
  });
}
