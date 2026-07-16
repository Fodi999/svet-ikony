import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { ShopCatalog } from '@/components/site/ShopCatalog';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'shopPageTitle'),
    description: translate(locale, 'shopPageLead'),
    path: '/shop',
    locale
  });
}

export default async function ShopPage() {
  const locale = await getRequestLocale();
  const [products, categories] = await Promise.all([
    publicApi.products(),
    publicApi.productCategories()
  ]);

  return (
    <main className="page icons-page">
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }]}
        current={translate(locale, 'navShop')}
      />
      <section className="page-hero icons-catalog-hero">
        <div>
          <p className="eyebrow"><T k="shopSectionName" /></p>
          <h1><T k="shopPageTitle" /></h1>
          <p><T k="shopPageLead" /></p>
        </div>
      </section>
      <ShopCatalog products={products} categories={categories} />
    </main>
  );
}
