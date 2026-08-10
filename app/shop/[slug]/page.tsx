import Link from 'next/link';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { DetailActions, DetailHero, Eyebrow, HeroCopy, HeroTitle, Lead, Page, Panel, PanelLabel, ReaderText, RelatedSection, SectionHead } from '@/components/site/PageChrome';
import { ProductCard } from '@/components/site/ProductCard';
import { ProductGallery } from '@/components/site/ProductGallery';
import { ProductOrderTrigger } from '@/components/site/ProductOrderModal';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { translate, withLocale } from '@/lib/i18n';
import { jsonLd, pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';
import { absoluteSiteUrl } from '@/lib/site';
import type { ChurchProductCategoryDto, ChurchProductDto } from '@/lib/types';

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const stockKey = { available: 'stockAvailable', made_to_order: 'stockMadeToOrder', unavailable: 'stockUnavailable' } as const;
const priceLabel = { uk: 'Ціна', ru: 'Цена', en: 'Price' } as const;
const schemaAvailability = {
  available: 'https://schema.org/InStock',
  made_to_order: 'https://schema.org/PreOrder',
  unavailable: 'https://schema.org/OutOfStock'
} as const;

function productName(product: ChurchProductDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return product.nameRu || product.nameUk;
  if (locale === 'en') return product.nameEn || product.nameUk;
  return product.nameUk;
}

function fullDescription(product: ChurchProductDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return product.fullDescriptionRu || product.fullDescriptionUk;
  if (locale === 'en') return product.fullDescriptionEn || product.fullDescriptionUk;
  return product.fullDescriptionUk;
}

function categoryName(category: ChurchProductCategoryDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return category.nameRu || category.nameUk;
  if (locale === 'en') return category.nameEn || category.nameUk;
  return category.nameUk;
}

function seoTitle(product: ChurchProductDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return product.seoTitleRu || product.seoTitleUk;
  if (locale === 'en') return product.seoTitleEn || product.seoTitleUk;
  return product.seoTitleUk;
}

function seoDescription(product: ChurchProductDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return product.seoDescriptionRu || product.seoDescriptionUk;
  if (locale === 'en') return product.seoDescriptionEn || product.seoDescriptionUk;
  return product.seoDescriptionUk;
}

function formatMoney(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const page = await publicApi.productBySlug(slug);
  if (!page) {
    return {
      ...pageMetadata({ title: translate(locale, 'pageNotFound'), path: `/shop/${slug}`, locale }),
      robots: { index: false }
    };
  }
  return pageMetadata({
    title: seoTitle(page.product, locale) || productName(page.product, locale),
    description: seoDescription(page.product, locale) || page.product.description,
    path: `/shop/${slug}`,
    image: page.product.photoUrl,
    locale
  });
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const [page, categories] = await Promise.all([publicApi.productBySlug(slug), publicApi.productCategories()]);

  if (!page) {
    return (
      <Page>
        <h1>{translate(locale, 'pageNotFound')}</h1>
      </Page>
    );
  }

  const { product, linkedIcon, related } = page;
  const name = productName(product, locale);
  const category = product.categoryId ? categories.find((item) => item.id === product.categoryId) : undefined;
  const galleryImages = Array.from(new Set([product.photoUrl, ...product.galleryUrls].filter(Boolean)));
  const iconSlug = linkedIcon?.translations.find((item) => item.language === locale)?.slug || linkedIcon?.translations[0]?.slug;
  const productUrl = absoluteSiteUrl(withLocale(`/shop/${product.slug}`, locale));

  return (
    <Page>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLd('Product', {
              name,
              description: seoDescription(product, locale) || product.description,
              image: galleryImages,
              sku: product.id,
              url: productUrl,
              category: category ? categoryName(category, locale) : undefined,
              offers: {
                '@type': 'Offer',
                url: productUrl,
                priceCurrency: product.currency,
                price: (product.priceCents / 100).toFixed(2),
                availability: schemaAvailability[product.stockStatus]
              }
            })
          )
        }}
      />
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }, { href: '/shop', label: translate(locale, 'navShop') }]}
        current={name}
      />
      <DetailHero>
        <ProductGallery images={galleryImages} alt={name} />
        <HeroCopy>
          {category ? <Eyebrow>{categoryName(category, locale)}</Eyebrow> : null}
          <HeroTitle>{name}</HeroTitle>
          <Lead>{product.description}</Lead>
          <dl className="mb-4.5 flex flex-wrap gap-2.5">
            <div className="rounded-xs border border-gold/28 bg-gold/6 px-3 py-2">
              <dt className="mb-0.5 text-[11px] font-bold text-muted-foreground uppercase">{priceLabel[locale]}</dt>
              <dd className="text-[15px] font-bold text-foreground">{formatMoney(product.priceCents, product.currency)}</dd>
            </div>
            {product.productionTime ? (
              <div className="rounded-xs border border-gold/28 bg-gold/6 px-3 py-2">
                <dt className="mb-0.5 text-[11px] font-bold text-muted-foreground uppercase">{translate(locale, 'productionTimeLabel')}</dt>
                <dd className="text-[15px] font-bold text-foreground">{product.productionTime}</dd>
              </div>
            ) : null}
            <div className="rounded-xs border border-gold/28 bg-gold/6 px-3 py-2">
              <dt className="mb-0.5 text-[11px] font-bold text-muted-foreground uppercase">{translate(locale, stockKey[product.stockStatus])}</dt>
            </div>
            {product.consecrationAvailable ? (
              <div className="rounded-xs border border-gold/28 bg-gold/6 px-3 py-2">
                <dt className="mb-0.5 text-[11px] font-bold text-muted-foreground uppercase">{translate(locale, 'consecrationAvailableLabel')}</dt>
              </div>
            ) : null}
          </dl>
          <DetailActions>
            <ProductOrderTrigger product={product} related={related} />
          </DetailActions>
          {iconSlug ? (
            <p className="mb-1 font-serif text-[15px] text-gold-light">
              <Link href={withLocale(`/icons/${iconSlug}`, locale)}>{translate(locale, 'aboutIconLink')}</Link>
            </p>
          ) : null}
        </HeroCopy>
      </DetailHero>

      {fullDescription(product, locale) ? (
        <Panel>
          <PanelLabel><T k="material" /></PanelLabel>
          <ReaderText>
            {fullDescription(product, locale).split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean).map((part) => <p key={part}>{part}</p>)}
          </ReaderText>
        </Panel>
      ) : null}

      {related.length ? (
        <RelatedSection>
          <SectionHead>
            <Eyebrow>{translate(locale, 'relatedProductsLabel')}</Eyebrow>
          </SectionHead>
          <div className="grid grid-cols-3 gap-[18px] max-[960px]:grid-cols-2 max-[560px]:grid-cols-1">
            {related.map((item) => <ProductCard key={item.id} product={item} />)}
          </div>
        </RelatedSection>
      ) : null}
    </Page>
  );
}
