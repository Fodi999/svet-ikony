import Link from 'next/link';
import { Breadcrumbs } from '@/components/site/Breadcrumbs';
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
      <main className="page">
        <h1>{translate(locale, 'pageNotFound')}</h1>
      </main>
    );
  }

  const { product, linkedIcon, related } = page;
  const name = productName(product, locale);
  const category = product.categoryId ? categories.find((item) => item.id === product.categoryId) : undefined;
  const galleryImages = Array.from(new Set([product.photoUrl, ...product.galleryUrls].filter(Boolean)));
  const iconSlug = linkedIcon?.translations.find((item) => item.language === locale)?.slug || linkedIcon?.translations[0]?.slug;
  const productUrl = absoluteSiteUrl(withLocale(`/shop/${product.slug}`, locale));

  return (
    <main className="detail-page">
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
      <section className="sacred-detail-hero">
        <ProductGallery images={galleryImages} alt={name} />
        <div className="sacred-hero-copy">
          {category ? <p className="eyebrow">{categoryName(category, locale)}</p> : null}
          <h1>{name}</h1>
          <p className="detail-lead">{product.description}</p>
          <dl className="icon-order-meta">
            <div><dt>{priceLabel[locale]}</dt><dd>{formatMoney(product.priceCents, product.currency)}</dd></div>
            {product.productionTime ? <div><dt>{translate(locale, 'productionTimeLabel')}</dt><dd>{product.productionTime}</dd></div> : null}
            <div><dt>{translate(locale, stockKey[product.stockStatus])}</dt></div>
            {product.consecrationAvailable ? <div><dt>{translate(locale, 'consecrationAvailableLabel')}</dt></div> : null}
          </dl>
          <div className="detail-actions">
            <ProductOrderTrigger product={product} related={related} />
          </div>
          {iconSlug ? (
            <p className="icon-order-icon-name">
              <Link href={withLocale(`/icons/${iconSlug}`, locale)}>{translate(locale, 'aboutIconLink')}</Link>
            </p>
          ) : null}
        </div>
      </section>

      {fullDescription(product, locale) ? (
        <article className="sacred-panel">
          <span><T k="material" /></span>
          <div className="reader-text">
            {fullDescription(product, locale).split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean).map((part) => <p key={part}>{part}</p>)}
          </div>
        </article>
      ) : null}

      {related.length ? (
        <section className="related-section">
          <div className="section-head"><p className="eyebrow">{translate(locale, 'relatedProductsLabel')}</p></div>
          <div className="product-grid">
            {related.map((item) => <ProductCard key={item.id} product={item} />)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
