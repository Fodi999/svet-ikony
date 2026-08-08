'use client';

import { useMemo, useState } from 'react';
import type { Saint } from '@/lib/types';
import { formatFeastDay, monthDayFromDate } from '@/lib/dates';
import { BrandLogo } from './BrandLogo';
import { useI18n } from './LanguageProvider';
import { SaintCard } from './SaintCard';

function normalized(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

type DateFilter = 'all' | 'today' | 'tomorrow' | 'custom';

export function SaintsCatalog({ saints }: { saints: Saint[] }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDate, setCustomDate] = useState('');

  const targetMonthDay = useMemo(() => {
    if (dateFilter === 'today') return monthDayFromDate(new Date());
    if (dateFilter === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return monthDayFromDate(tomorrow);
    }
    if (dateFilter === 'custom' && customDate) return customDate.slice(5);
    return null;
  }, [dateFilter, customDate]);

  const visibleSaints = useMemo(() => {
    const search = normalized(query);
    return saints.filter((saint) => {
      const matchesDate = !targetMonthDay || saint.feastDay === targetMonthDay;
      const haystack = normalized([saint.name, saint.shortDescription, saint.biography].join(' '));
      return matchesDate && (!search || haystack.includes(search));
    });
  }, [saints, query, targetMonthDay]);

  return (
    <>
      <div className="icons-toolbar saints-toolbar">
        <label className="icons-search-field">
          <span>{t('search')}</span>
          <span className="icons-search-control">
            <BrandLogo className="icons-search-logo" size={24} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('saintSearchPlaceholder')}
              type="search"
            />
          </span>
        </label>

        <div className="saints-date-filter">
          <span>{t('saintFilterLabel')}</span>
          <div className="saints-date-filter-buttons">
            <button type="button" className={dateFilter === 'all' ? 'active' : ''} onClick={() => setDateFilter('all')}>
              {t('saintFilterAll')}
            </button>
            <button type="button" className={dateFilter === 'today' ? 'active' : ''} onClick={() => setDateFilter('today')}>
              {t('saintFilterToday')}
            </button>
            <button type="button" className={dateFilter === 'tomorrow' ? 'active' : ''} onClick={() => setDateFilter('tomorrow')}>
              {t('saintFilterTomorrow')}
            </button>
            <label className={`saints-date-pill${dateFilter === 'custom' ? ' active' : ''}`}>
              <span>{dateFilter === 'custom' && customDate ? formatFeastDay(customDate.slice(5), locale) : t('saintFilterCustom')}</span>
              <input
                type="date"
                value={customDate}
                onChange={(event) => {
                  setCustomDate(event.target.value);
                  setDateFilter('custom');
                }}
                aria-label={t('saintFilterCustom')}
              />
            </label>
          </div>
        </div>
      </div>

      <section className="icons-catalog-section">
        {visibleSaints.length ? (
          <div className="icon-grid">{visibleSaints.map((saint) => <SaintCard key={saint.id} saint={saint} />)}</div>
        ) : (
          <p className="icons-empty">{t('noSaintsFound')}</p>
        )}
      </section>
    </>
  );
}
