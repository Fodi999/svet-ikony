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
    <Link
      className="grid min-w-0 grid-rows-[auto_1fr] gap-0 rounded-md border border-gold/28 bg-background p-0 no-underline transition-[border-color,transform] duration-200 ease-brand hover:-translate-y-0.5 hover:border-gold"
      href={localeHref(`/shop/${product.slug}`)}
    >
      <figure className="relative m-0 grid aspect-[4/5] place-items-center overflow-hidden border-b border-gold/28 bg-[linear-gradient(160deg,rgba(127,141,101,.09),transparent_62%),#1b1c16] p-[clamp(16px,2.2vw,34px)]">
        <StableImage
          src={product.photoUrl}
          alt={name}
          width={640}
          height={800}
          className="block h-[clamp(220px,28vw,420px)] w-full max-w-[min(100%,380px)] rounded-xs object-contain"
        />
        {product.stockStatus !== 'available' ? (
          <span className="absolute top-3 right-3 rounded-full border border-gold/28 bg-black/78 px-2.5 py-1 text-[11px] font-extrabold text-gold-light uppercase">
            {t(product.stockStatus === 'made_to_order' ? 'stockMadeToOrder' : 'stockUnavailable')}
          </span>
        ) : null}
      </figure>
      <div className="grid content-start gap-2.5 p-[clamp(16px,2vw,22px)]">
        <h3 className="m-0 text-[clamp(17px,1.6vw,21px)] leading-tight text-foreground">{name}</h3>
        {product.description ? <p className="m-0 line-clamp-2 text-sm leading-snug text-muted-foreground">{product.description}</p> : null}
        <div className="flex items-center justify-between gap-2.5">
          <b className="text-[17px] text-gold-light">{formatMoney(product.priceCents, product.currency)}</b>
          <small className="font-bold tracking-[.06em] text-muted-foreground uppercase">{t('viewProduct')}</small>
        </div>
      </div>
    </Link>
  );
}
