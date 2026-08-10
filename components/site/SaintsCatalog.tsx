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

  const dateButtonClass = (active: boolean) =>
    `relative inline-flex min-h-11 items-center rounded-sm border px-4 text-[14px] font-extrabold cursor-pointer transition-[border-color,color,background] duration-[180ms] ease-brand ${
      active ? 'border-gold bg-gold/14 text-gold-light' : 'border-gold/28 bg-[#141511] text-muted-foreground hover:border-gold hover:text-foreground'
    }`;

  return (
    <>
      <div className="grid grid-cols-[minmax(280px,1fr)_minmax(320px,480px)] items-end gap-3.5 max-w-[1180px] mt-[clamp(22px,3vw,38px)] mx-0 max-[900px]:gap-3 max-[900px]:max-w-none max-[720px]:grid-cols-1 max-[430px]:mt-5">
        <label className="min-w-0 grid gap-2">
          <span className="text-muted-foreground text-[11px] font-black tracking-[.12em] uppercase">{t('search')}</span>
          <span className="relative block">
            <BrandLogo className="absolute top-1/2 left-4 z-[1] size-6 opacity-[.72] -translate-y-1/2 pointer-events-none" size={24} />
            <input
              className="rounded-sm! border! border-gold/28! bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_46%),#141511]! py-3.5! text-foreground! min-h-14 text-base font-bold outline-none pl-[52px]! pr-4! placeholder:text-muted-foreground placeholder:font-semibold focus:border-gold focus:shadow-[inset_0_0_0_1px_rgba(214,168,79,.38)] max-[520px]:min-h-[52px] max-[430px]:min-h-[50px] max-[430px]:pl-3! max-[430px]:pr-3! max-[430px]:text-[15px]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('saintSearchPlaceholder')}
              type="search"
            />
          </span>
        </label>

        <div className="min-w-0 grid gap-2">
          <span className="text-muted-foreground text-[11px] font-black tracking-[.12em] uppercase">{t('saintFilterLabel')}</span>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className={dateButtonClass(dateFilter === 'all')} onClick={resetDate}>
              {t('saintFilterAll')}
            </button>
            <button type="button" className={dateButtonClass(dateFilter === 'today')} onClick={() => setDateFilter('today')}>
              {t('saintFilterToday')}
            </button>
            <button type="button" className={dateButtonClass(dateFilter === 'tomorrow')} onClick={() => setDateFilter('tomorrow')}>
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

      <section className="mt-[clamp(20px,3vw,42px)]">
        {targetMonthDay ? (
          <h2 className="mt-0 mx-0 mb-[clamp(16px,2.4vw,28px)] text-gold-light text-[clamp(20px,2vw,26px)]">
            {t('saintsPageEyebrow')} — {formatFeastDay(targetMonthDay, locale)}
          </h2>
        ) : null}
        {visibleSaints.length ? (
          <div className="grid grid-cols-3 gap-[clamp(14px,2vw,28px)] mt-[clamp(28px,4vw,58px)] max-[900px]:grid-cols-1 max-[900px]:gap-3 max-[900px]:mt-6">
            {visibleSaints.map((saint) => <SaintCard key={saint.id} saint={saint} />)}
          </div>
        ) : (
          <p className="relative m-0 rounded-[8px] border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] p-7 text-muted-foreground text-[18px] font-bold overflow-hidden">
            {targetMonthDay ? t('noSaintsFoundForDate') : t('noSaintsFound')}
          </p>
        )}
      </section>
    </>
  );
}
