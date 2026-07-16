'use client';

import Link from 'next/link';
import type { ChurchProductDto } from '@/lib/types';
import { useI18n, useLocaleHref } from './LanguageProvider';
import { StableImage } from './StableImage';

function localizedName(product: ChurchProductDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return product.nameRu || product.nameUk;
  if (locale === 'en') return product.nameEn || product.nameUk;
  return product.nameUk;
}

function formatMoney(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function ProductCard({ product }: { product: ChurchProductDto }) {
  const { locale, t } = useI18n();
  const localeHref = useLocaleHref();
  const name = localizedName(product, locale);

  return (
    <Link className="product-card" href={localeHref(`/shop/${product.slug}`)}>
      <figure>
        <StableImage src={product.photoUrl} alt={name} width={640} height={800} />
        {product.stockStatus !== 'available' ? (
          <span className="product-card-badge">{t(product.stockStatus === 'made_to_order' ? 'stockMadeToOrder' : 'stockUnavailable')}</span>
        ) : null}
      </figure>
      <div className="product-card-copy">
        <h3>{name}</h3>
        {product.description ? <p>{product.description}</p> : null}
        <div className="product-card-footer">
          <b>{formatMoney(product.priceCents, product.currency)}</b>
          <small>{t('viewProduct')}</small>
        </div>
      </div>
    </Link>
  );
}
