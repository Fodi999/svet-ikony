import { withErrors } from '@/lib/d1/errors';
import { getActiveProductBySlug, listProducts } from '@/lib/d1/repositories/products';
import { listIcons } from '@/lib/d1/repositories/icons';

/**
 * Public — no admin auth. Stage 2E cutover: replaces old Koyeb
 * `GET /api/church/products/:slug`, composing `PublicProductPage`.
 * `related`: other active products in the same category, excluding itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withErrors(async () => {
    const { slug } = await params;
    const product = await getActiveProductBySlug(slug);
    if (!product) return Response.json(null);

    const allProducts = await listProducts();
    const related = allProducts.filter(
      (item) => item.id !== product.id && item.isActive && item.categoryId === product.categoryId,
    );

    let linkedIcon = null;
    if (product.linkedIconTranslationGroupId) {
      const icons = await listIcons({});
      const groupIcons = icons.filter((icon) => icon.translationGroupId === product.linkedIconTranslationGroupId);
      if (groupIcons.length > 0) {
        linkedIcon = {
          translationGroupId: product.linkedIconTranslationGroupId,
          translations: groupIcons.map((icon) => ({ language: icon.language, slug: icon.slug, title: icon.title })),
        };
      }
    }

    return Response.json({ product, linkedIcon, related });
  });
}
