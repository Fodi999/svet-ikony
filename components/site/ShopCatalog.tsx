'use client';

import { useMemo, useState } from 'react';
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
      <label className="shop-search-field">
        <span>{t('search')}</span>
        <span className="icons-search-control">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('productSearchPlaceholder')}
            type="search"
          />
        </span>
      </label>

      {categories.length ? (
        <div className="shop-category-rail" role="tablist" aria-label={t('section')}>
          <button
            type="button"
            className={`shop-category-tile${categoryId === 'all' ? ' active' : ''}`}
            onClick={() => setCategoryId('all')}
          >
            <span className="shop-category-tile-photo shop-category-tile-photo--all" aria-hidden="true" />
            <b>{t('allSections')}</b>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`shop-category-tile${categoryId === category.id ? ' active' : ''}`}
              onClick={() => setCategoryId(category.id)}
            >
              <span className="shop-category-tile-photo">
                {category.imageUrl ? <img src={category.imageUrl} alt="" loading="lazy" /> : null}
              </span>
              <b>{categoryName(category, locale)}</b>
            </button>
          ))}
        </div>
      ) : null}

      <section className="icons-catalog-section">
        {visibleProducts.length ? (
          <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        ) : (
          <p className="icons-empty">{t('noProductsFound')}</p>
        )}
      </section>
    </>
  );
}
