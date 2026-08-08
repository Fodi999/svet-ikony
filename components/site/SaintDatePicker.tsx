'use client';

import { useEffect, useRef, useState } from 'react';
import { formatFeastDay, localeCode } from '@/lib/dates';
import { useI18n } from './LanguageProvider';

const WEEKDAY_KEYS = ['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun'] as const;

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// JS Date#getDay() is 0=Sun..6=Sat; shift so the grid starts on Monday.
function mondayFirstOffset(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

type Props = {
  value: string; // "MM-DD" or ""
  onChange: (monthDay: string) => void;
  placeholder: string;
};

/**
 * A small in-page dropdown month picker for feast-day filtering — chosen
 * over a native <input type="date"> because its chrome can't be styled to
 * match the site (varies wildly by browser/OS) and it never shows a
 * pretty "17 грудня" label back in the trigger. The year shown is
 * whatever the visitor is currently browsing; only the "MM-DD" the click
 * lands on is ever reported, since church_saints.feast_day is year-
 * agnostic (it recurs every year).
 */
export function SaintDatePicker({ value, onChange, placeholder }: Props) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const monthLabel = new Intl.DateTimeFormat(localeCode(locale), { month: 'long', year: 'numeric' }).format(
    new Date(viewYear, viewMonth, 1)
  );
  const leading = mondayFirstOffset(viewYear, viewMonth);
  const total = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [...Array(leading).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const [selMonth, selDay] = value ? value.split('-').map(Number) : [null, null];

  return (
    <div className="saints-date-picker" ref={containerRef}>
      <button type="button" className={`saints-date-pill${value ? ' active' : ''}`} onClick={() => setOpen((v) => !v)}>
        {value ? formatFeastDay(value, locale) : placeholder}
      </button>
      {open ? (
        <div className="saints-date-picker-panel">
          <div className="saints-date-picker-header">
            <button type="button" aria-label="prev" onClick={() => shiftMonth(-1)}>‹</button>
            <span>{monthLabel}</span>
            <button type="button" aria-label="next" onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="saints-date-picker-weekdays">
            {WEEKDAY_KEYS.map((key) => <span key={key}>{t(key)}</span>)}
          </div>
          <div className="saints-date-picker-grid">
            {cells.map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} />;
              const isSelected = selMonth === viewMonth + 1 && selDay === day;
              const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  className={[isSelected ? 'selected' : '', isToday ? 'is-today' : ''].filter(Boolean).join(' ')}
                  onClick={() => {
                    onChange(`${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
