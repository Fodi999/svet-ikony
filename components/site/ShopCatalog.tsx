'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { ChurchProductCategoryDto, ChurchProductDto } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import { ProductCard } from './ProductCard';
import { SvgIcon } from './SvgIcon';

function normalized(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

function categoryName(category: ChurchProductCategoryDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return category.nameRu || category.nameUk;
  if (locale === 'en') return category.nameEn || category.nameUk;
  return category.nameUk;
}

function productName(product: ChurchProductDto, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'ru') return product.nameRu || product.nameUk;
  if (locale === 'en') return product.nameEn || product.nameUk;
  return product.nameUk;
}

export function ShopCatalog({ products, categories }: { products: ChurchProductDto[]; categories: ChurchProductCategoryDto[] }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');

  const visibleProducts = useMemo(() => {
    const search = normalized(query);
    return products.filter((product) => {
      // "All" includes uncategorized products by design.
      const matchesCategory = categoryId === 'all' || product.categoryId === categoryId;
      const haystack = normalized([productName(product, locale), product.description, product.slug].join(' '));
      return matchesCategory && (!search || haystack.includes(search));
    });
  }, [categoryId, locale, products, query]);

  return (
    <>
      <label className="mt-[clamp(22px,3vw,38px)] grid max-w-[480px] gap-2">
        <span className="text-[11px] font-black tracking-[.12em] text-muted-foreground uppercase">{t('search')}</span>
        <span className="relative block">
          <Input
            className="min-h-14 pl-[52px] text-base font-bold outline-none focus:border-gold focus:shadow-[inset_0_0_0_1px_rgba(214,168,79,.38)]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('productSearchPlaceholder')}
            type="search"
          />
        </span>
      </label>

      {categories.length ? (
        // Mobile-first horizontal chip strip. Each chip is a real bordered
        // card (was: bare circle + label floating on nothing, border-0
        // bg-none -- read as "unstyled placeholder", not a category chip),
        // sized to the container's own aspect (size-16 thumb / h-full
        // w-full object-cover) instead of a fixed circle diameter that left
        // empty space around smaller source photos.
        <div
          className="mt-[clamp(18px,2.5vw,30px)] flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
          role="tablist"
          aria-label={t('section')}
        >
          <button
            type="button"
            className={`group flex w-28 shrink-0 snap-start cursor-pointer flex-col items-center gap-2 rounded-2xl border p-2.5 text-center transition-[border-color,background,box-shadow,transform] duration-200 ease-brand hover:-translate-y-0.5 hover:border-gold ${
              categoryId === 'all' ? 'border-gold bg-[#1b1c16] shadow-[0_0_0_3px_rgba(214,168,79,.16)]' : 'border-gold/28 bg-[#141511]'
            }`}
            onClick={() => setCategoryId('all')}
          >
            <span
              aria-hidden="true"
              className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-gold/20 bg-[linear-gradient(135deg,rgba(214,168,79,.28),rgba(127,141,101,.18))] text-gold-light"
            >
              <SvgIcon name="grid" size={22} />
            </span>
            <b className={`line-clamp-2 text-sm leading-tight font-semibold transition-colors duration-200 ease-brand ${categoryId === 'all' ? 'text-gold-light' : 'text-muted-foreground'}`}>
              {t('allSections')}
            </b>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`group flex w-28 shrink-0 snap-start cursor-pointer flex-col items-center gap-2 rounded-2xl border p-2.5 text-center transition-[border-color,background,box-shadow,transform] duration-200 ease-brand hover:-translate-y-0.5 hover:border-gold ${
                categoryId === category.id ? 'border-gold bg-[#1b1c16] shadow-[0_0_0_3px_rgba(214,168,79,.16)]' : 'border-gold/28 bg-[#141511]'
              }`}
              onClick={() => setCategoryId(category.id)}
            >
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-gold/20 bg-[#1b1c16]">
                {category.imageUrl ? (
                  <img src={category.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <SvgIcon name="grid" size={20} className="text-gold-light/70" />
                )}
              </span>
              <b
                className={`line-clamp-2 text-sm leading-tight font-semibold transition-colors duration-200 ease-brand ${
                  categoryId === category.id ? 'text-gold-light' : 'text-muted-foreground'
                }`}
              >
                {categoryName(category, locale)}
              </b>
            </button>
          ))}
        </div>
      ) : null}

      <section className="mt-[clamp(20px,3vw,42px)]">
        {visibleProducts.length ? (
          <div className="grid grid-cols-3 gap-[18px] max-[960px]:grid-cols-2 max-[560px]:grid-cols-1">
            {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <p className="relative m-0 rounded-[8px] border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] p-7 text-muted-foreground text-[18px] font-bold overflow-hidden">
            {t('noProductsFound')}
          </p>
        )}
      </section>
    </>
  );
}
