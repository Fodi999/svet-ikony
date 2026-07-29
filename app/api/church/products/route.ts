import { NextRequest } from 'next/server';
import { withErrors } from '@/lib/d1/errors';
import { listProducts } from '@/lib/d1/repositories/products';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/products`. Filtering (category/search/featured/
 * linkedIconGroupId) happens here since `listProducts()` has no query
 * params — matches the confirmed real call site (IconOrderLink.tsx's
 * `linkedIconGroupId` filter); `ShopCatalog.tsx` fetches unfiltered and
 * filters client-side, same as every other list endpoint in this cutover.
 */
export async function GET(request: NextRequest) {
  return withErrors(async () => {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.trim().toLowerCase();
    const featuredParam = searchParams.get('featured');
    const linkedIconGroupId = searchParams.get('linkedIconGroupId');

    let products = await listProducts();
    if (category) products = products.filter((item) => item.categoryId === category);
    if (featuredParam !== null) products = products.filter((item) => item.featured === (featuredParam === 'true'));
    if (linkedIconGroupId) products = products.filter((item) => item.linkedIconTranslationGroupId === linkedIconGroupId);
    if (search) {
      products = products.filter((item) =>
        [item.nameUk, item.nameRu, item.nameEn].some((name) => name.toLowerCase().includes(search)),
      );
    }

    return Response.json(products);
  });
}
