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
 * ported to Tailwind + shadcn (see app/globals.css for how
 * Tailwind is scoped in without disturbing the rest of the site's CSS).
 * The trigger pill matches SaintsCatalog.tsx's "Сьогодні"/"Завтра" sibling
 * buttons (own duplicated Tailwind string, not a shared export — same
 * treatment as the rest of this migration's small per-component helpers).
 * Only "MM-DD" is ever reported, since church_saints.feast_day is
 * year-agnostic (it recurs every year).
 */
export function SaintDatePicker({ value, onChange, placeholder }: Props) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);

  const selected = value ? new Date(2024, Number(value.slice(0, 2)) - 1, Number(value.slice(3))) : undefined;
  const triggerClass = `relative inline-flex min-h-11 items-center rounded-sm border px-4 text-[14px] font-extrabold cursor-pointer transition-[border-color,color,background] duration-[180ms] ease-brand ${
    value ? 'border-gold bg-gold/14 text-gold-light' : 'border-gold/28 bg-[#141511] text-muted-foreground hover:border-gold hover:text-foreground'
  }`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClass}>
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
