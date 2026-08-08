'use client';

import { useMemo, useState } from 'react';
import type { Saint } from '@/lib/types';
import { formatFeastDay, monthDayFromDate } from '@/lib/dates';
import { BrandLogo } from './BrandLogo';
import { useI18n } from './LanguageProvider';
import { SaintCard } from './SaintCard';
import { SaintDatePicker } from './SaintDatePicker';

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
    if (dateFilter === 'custom' && customDate) return customDate;
    return null;
  }, [dateFilter, customDate]);

  const visibleSaints = useMemo(() => {
    const search = normalized(query);
    return saints.filter((saint) => {
      const matchesDate =
        !targetMonthDay || saint.feastDayNewStyle === targetMonthDay || saint.feastDayOldStyle === targetMonthDay;
      const haystack = normalized([saint.name, saint.shortDescription, saint.biography].join(' '));
      return matchesDate && (!search || haystack.includes(search));
    });
  }, [saints, query, targetMonthDay]);

  function resetDate() {
    setDateFilter('all');
    setCustomDate('');
  }

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
            <button type="button" className={dateFilter === 'all' ? 'active' : ''} onClick={resetDate}>
              {t('saintFilterAll')}
            </button>
            <button type="button" className={dateFilter === 'today' ? 'active' : ''} onClick={() => setDateFilter('today')}>
              {t('saintFilterToday')}
            </button>
            <button type="button" className={dateFilter === 'tomorrow' ? 'active' : ''} onClick={() => setDateFilter('tomorrow')}>
              {t('saintFilterTomorrow')}
            </button>
            <SaintDatePicker
              value={dateFilter === 'custom' ? customDate : ''}
              placeholder={t('saintFilterCustom')}
              onChange={(monthDay) => {
                setCustomDate(monthDay);
                setDateFilter('custom');
              }}
            />
          </div>
        </div>
      </div>

      <section className="icons-catalog-section">
        {targetMonthDay ? (
          <h2 className="saints-filtered-heading">
            {t('saintsPageEyebrow')} — {formatFeastDay(targetMonthDay, locale)}
          </h2>
        ) : null}
        {visibleSaints.length ? (
          <div className="icon-grid">{visibleSaints.map((saint) => <SaintCard key={saint.id} saint={saint} />)}</div>
        ) : (
          <p className="icons-empty">{targetMonthDay ? t('noSaintsFoundForDate') : t('noSaintsFound')}</p>
        )}
      </section>
    </>
  );
}
