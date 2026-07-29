import { withErrors } from '@/lib/d1/errors';
import { listProductCategories } from '@/lib/d1/repositories/productCategories';

/** Public — no admin auth. Stage 2E cutover: replaces old Koyeb `GET /api/church/product-categories`. */
export async function GET() {
  return withErrors(async () => {
    const categories = await listProductCategories();
    return Response.json(categories);
  });
}
