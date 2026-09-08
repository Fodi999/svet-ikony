import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { Hreflang } from '@/components/site/Hreflang';
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
      <Hreflang locale={locale} path="/shop" />
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }]}
        current={translate(locale, 'navShop')}
      />
      {/*
       * Root cause of the mobile hero title breaking letter-by-letter: this
       * grid always defined 2 columns (grid-cols-[minmax(0,1fr)_minmax(260px,420px)])
       * with only ONE child ever rendered below. An empty grid track still
       * reserves its own space -- the second column's 260px hard minimum
       * never released on mobile, squeezing the first column (holding the
       * <h1>) down to ~a few dozen px. HeroTitle's own max-w-[min(100%,1180px)]
       * + [overflow-wrap:anywhere] then dutifully shrank to fit that sliver,
       * breaking every word onto its own line. max-[900px]:grid-cols-1 below
       * mirrors DetailHero's own established convention (PageChrome.tsx) for
       * collapsing a 2-column hero on mobile/tablet.
       */}
      <section className="grid grid-cols-[minmax(0,1fr)_minmax(260px,420px)] gap-[clamp(24px,5vw,80px)] items-end pt-0 px-0 pb-[clamp(30px,4vw,64px)] border-b border-gold/28 max-[900px]:grid-cols-1 max-[900px]:items-start">
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
