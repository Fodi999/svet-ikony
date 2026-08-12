'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { ChurchProductCategoryDto, ChurchProductDto } from '@/lib/types';
import { useI18n } from './LanguageProvider';
import { ProductCard } from './ProductCard';

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
        <div
          className="mt-[clamp(18px,2.5vw,30px)] flex gap-[clamp(10px,1.4vw,16px)] overflow-x-auto pb-1.5 [scrollbar-width:thin]"
          role="tablist"
          aria-label={t('section')}
        >
          <button
            type="button"
            className="group grid w-24 flex-none cursor-pointer justify-items-center gap-2 border-0 bg-none max-[560px]:w-[76px]"
            onClick={() => setCategoryId('all')}
          >
            <span
              aria-hidden="true"
              className={`grid size-21 place-items-center overflow-hidden rounded-full border-2 bg-[linear-gradient(135deg,rgba(214,168,79,.28),rgba(127,141,101,.18))] transition-[border-color,transform] duration-200 ease-brand group-hover:-translate-y-0.5 group-hover:border-gold max-[560px]:size-[66px] ${
                categoryId === 'all' ? 'border-gold shadow-[0_0_0_3px_rgba(214,168,79,.22)]' : 'border-gold/28'
              }`}
            />
            <b className={`text-center text-xs leading-tight font-extrabold transition-colors duration-200 ease-brand ${categoryId === 'all' ? 'text-gold-light' : 'text-muted-foreground'}`}>
              {t('allSections')}
            </b>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className="group grid w-24 flex-none cursor-pointer justify-items-center gap-2 border-0 bg-none max-[560px]:w-[76px]"
              onClick={() => setCategoryId(category.id)}
            >
              <span
                className={`grid size-21 place-items-center overflow-hidden rounded-full border-2 bg-[#1b1c16] transition-[border-color,transform] duration-200 ease-brand group-hover:-translate-y-0.5 group-hover:border-gold max-[560px]:size-[66px] ${
                  categoryId === category.id ? 'border-gold shadow-[0_0_0_3px_rgba(214,168,79,.22)]' : 'border-gold/28'
                }`}
              >
                {category.imageUrl ? <img src={category.imageUrl} alt="" loading="lazy" className="size-full object-cover" /> : null}
              </span>
              <b
                className={`text-center text-xs leading-tight font-extrabold transition-colors duration-200 ease-brand ${
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
