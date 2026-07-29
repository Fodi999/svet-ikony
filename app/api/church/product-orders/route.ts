import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { createProductOrder, type CreateProductOrderPayload } from '@/lib/d1/repositories/orders';

/** Public endpoint — no admin auth, matches
 * assistant/src/interfaces/http/church_orders.rs public_create_product_order. */
export async function POST(request: NextRequest) {
  return withErrors(async () => {
    const payload = await request.json() as CreateProductOrderPayload;
    const result = await createProductOrder(payload, request.headers);
    return Response.json(result, { status: 201 });
  });
}
