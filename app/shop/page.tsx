import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { Eyebrow, HeroTitle, Lead, Page } from '@/components/site/PageChrome';
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
    <Page className="overflow-hidden">
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }]}
        current={translate(locale, 'navShop')}
      />
      <section className="grid grid-cols-[minmax(0,1fr)_minmax(260px,420px)] gap-[clamp(24px,5vw,80px)] items-end pt-0 px-0 pb-[clamp(30px,4vw,64px)] border-b border-gold/28 max-[900px]:items-start">
        <div>
          <Eyebrow><T k="shopSectionName" /></Eyebrow>
          <HeroTitle className="max-w-[980px]">
            <T k="shopPageTitle" />
          </HeroTitle>
          <Lead><T k="shopPageLead" /></Lead>
        </div>
      </section>
      <ShopCatalog products={products} categories={categories} />
    </Page>
  );
}
