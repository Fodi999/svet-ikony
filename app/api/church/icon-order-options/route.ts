import { withErrors } from '@/lib/d1/errors';
import { listProducts } from '@/lib/d1/repositories/products';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/icon-order-options`. `ChurchIconOrderOptionDto` is a
 * type alias of `ChurchProductDto` (lib/types.ts) — same data as
 * /api/church/products. No known caller in the current frontend (checked:
 * `publicApi.iconOrderOptions` has zero call sites in app/components), kept
 * for contract completeness.
 */
export async function GET() {
  return withErrors(async () => {
    const products = await listProducts();
    return Response.json(products);
  });
}
