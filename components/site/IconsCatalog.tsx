'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { Icon } from '@/lib/types';
import { localizeIcon } from '@/lib/iconContent';
import { BrandLogo } from './BrandLogo';
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
      <div className="grid grid-cols-[minmax(280px,1fr)_minmax(220px,340px)] items-end gap-3.5 max-w-[1180px] mt-[clamp(22px,3vw,38px)] mx-0 max-[900px]:gap-3 max-[900px]:max-w-none max-[720px]:grid-cols-1 max-[430px]:mt-5">
        <label className="min-w-0 grid gap-2">
          <span className="text-muted-foreground text-[11px] font-black tracking-[.12em] uppercase">{t('search')}</span>
          <span className="relative block">
            <BrandLogo className="absolute top-1/2 left-4 z-[1] size-6 opacity-[.72] -translate-y-1/2 pointer-events-none" size={24} />
            <Input
              className="min-h-14 pl-[52px] pr-4 text-base font-bold outline-none placeholder:text-muted-foreground placeholder:font-semibold focus:border-gold focus:shadow-[inset_0_0_0_1px_rgba(214,168,79,.38)] max-[520px]:min-h-[52px] max-[430px]:min-h-[50px] max-[430px]:pl-3 max-[430px]:pr-3"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('iconSearchPlaceholder')}
              type="search"
            />
          </span>
        </label>
        <div className="relative min-w-0 grid gap-2">
          <span className="text-muted-foreground text-[11px] font-black tracking-[.12em] uppercase">{t('section')}</span>
          <button
            className="w-full inline-flex min-h-14 items-center justify-between gap-3.5 rounded-sm border border-gold/28 px-4 bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_46%),linear-gradient(160deg,rgba(127,141,101,.05),transparent_62%),#141511] text-foreground cursor-pointer outline-none focus-visible:border-gold focus-visible:shadow-[inset_0_0_0_1px_rgba(214,168,79,.38)] max-[520px]:min-h-[52px] max-[430px]:min-h-[50px] max-[430px]:px-3 max-[430px]:text-[15px]"
            type="button"
            aria-expanded={categoryOpen}
            onClick={() => setCategoryOpen((open) => !open)}
          >
            <b className="min-w-0 overflow-hidden text-[16px] font-black leading-none text-ellipsis whitespace-nowrap">{currentCategory}</b>
            <i
              className={`size-2.5 flex-none border-r-2 border-b-2 border-gold-light transition-transform duration-[180ms] ease-brand ${
                categoryOpen ? '-translate-y-0.5 rotate-[225deg]' : '-translate-y-0.5 rotate-45'
              }`}
              aria-hidden="true"
            />
          </button>
          {categoryOpen ? (
            <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-30 grid rounded-sm border border-gold bg-[#141511] shadow-[0_14px_34px_rgba(0,0,0,.24)] overflow-hidden">
              {categoryOptions.map((item) => (
                <button
                  key={item.value}
                  className={`min-h-11 border-0 border-b border-b-[rgba(232,211,169,.13)] px-3.5 bg-transparent text-muted-foreground text-[15px] font-extrabold text-left cursor-pointer last:border-b-0 hover:bg-gold/14 hover:text-gold-light max-[430px]:min-h-[42px] max-[430px]:text-[14px] ${
                    item.value === category ? 'bg-gold/14 text-gold-light' : ''
                  }`}
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

      <section className="mt-[clamp(20px,3vw,42px)]">
        {visibleIcons.length ? (
          <div className="grid grid-cols-3 gap-[18px] mt-0 max-[900px]:grid-cols-2 max-[900px]:gap-3 max-[720px]:grid-cols-1 max-[720px]:gap-3.5">
            {visibleIcons.map((icon) => <IconCard key={icon.id} icon={icon} />)}
          </div>
        ) : (
          <p className="relative m-0 rounded-[8px] border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] p-7 text-muted-foreground text-[18px] font-bold overflow-hidden">
            {t('noIconsFound')}
          </p>
        )}
      </section>
    </>
  );
}
