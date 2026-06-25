'use client';

import { useMemo, useState } from 'react';
import type { Icon } from '@/lib/types';
import { localizeIcon } from '@/lib/iconContent';
import { useI18n } from './LanguageProvider';
import { IconCard } from './IconCard';

function normalized(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

export function IconsCatalog({ icons }: { icons: Icon[] }) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const localizedIcons = useMemo(() => icons.map((icon) => localizeIcon(icon, locale)), [icons, locale]);
  const categories = useMemo(() => Array.from(new Set(localizedIcons.map((icon) => icon.category).filter(Boolean))), [localizedIcons]);
  const categoryOptions = useMemo(() => [{ value: 'all', label: t('allSections') }, ...categories.map((item) => ({ value: item, label: item }))], [categories, t]);
  const currentCategory = categoryOptions.find((item) => item.value === category)?.label || categoryOptions[0].label;
  const visibleIcons = useMemo(() => {
    const search = normalized(query);
    return localizedIcons.filter((icon) => {
      const matchesCategory = category === 'all' || icon.category === category;
      const haystack = normalized([
        icon.title,
        icon.category,
        icon.saintName,
        icon.shortDescription
      ].join(' '));

      return matchesCategory && (!search || haystack.includes(search));
    });
  }, [category, localizedIcons, query]);

  return (
    <>
      <div className="icons-toolbar">
        <label className="icons-search-field">
          <span>{t('search')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('iconSearchPlaceholder')}
            type="search"
          />
        </label>
        <div className="icons-select-field">
          <span>{t('section')}</span>
          <button
            className="icons-select-button"
            type="button"
            aria-expanded={categoryOpen}
            onClick={() => setCategoryOpen((open) => !open)}
          >
            <b>{currentCategory}</b>
            <i aria-hidden="true" />
          </button>
          {categoryOpen ? (
            <div className="icons-select-menu">
              {categoryOptions.map((item) => (
                <button
                  key={item.value}
                  className={item.value === category ? 'active' : ''}
                  type="button"
                  onClick={() => {
                    setCategory(item.value);
                    setCategoryOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section className="icons-catalog-section">
        {visibleIcons.length ? (
          <div className="icon-grid">{visibleIcons.map((icon) => <IconCard key={icon.id} icon={icon} />)}</div>
        ) : (
          <p className="icons-empty">{t('noIconsFound')}</p>
        )}
      </section>
    </>
  );
}
