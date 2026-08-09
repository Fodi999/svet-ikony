'use client';

import { useState } from 'react';
import { ru, uk, enUS } from 'date-fns/locale';
import { formatFeastDay } from '@/lib/dates';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from './LanguageProvider';

const DATE_FNS_LOCALES = { uk, ru, en: enUS };

type Props = {
  value: string; // "MM-DD" or ""
  onChange: (monthDay: string) => void;
  placeholder: string;
};

/**
 * The calendar dropdown for feast-day filtering — first piece of the site
 * ported to Tailwind + shadcn (see app/styles/tailwind-scope.css for how
 * Tailwind is scoped in without disturbing the rest of the site's CSS).
 * The trigger pill stays on the existing .saints-date-pill styling so it
 * still matches its "Сьогодні"/"Завтра" siblings — only the calendar
 * panel itself is the new stack. Only "MM-DD" is ever reported, since
 * church_saints.feast_day is year-agnostic (it recurs every year).
 */
export function SaintDatePicker({ value, onChange, placeholder }: Props) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);

  const selected = value ? new Date(2024, Number(value.slice(0, 2)) - 1, Number(value.slice(3))) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={`saints-date-pill${value ? ' active' : ''}`}>
        {value ? formatFeastDay(value, locale) : placeholder}
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          locale={DATE_FNS_LOCALES[locale]}
          onSelect={(date) => {
            if (!date) return;
            onChange(`${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
            setOpen(false);
          }}
          aria-label={t('saintFilterCustom')}
        />
      </PopoverContent>
    </Popover>
  );
}
