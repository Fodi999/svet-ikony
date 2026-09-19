import { gregorianToJulianCalendarDate } from '@/lib/telegram/julian-calendar';

export type CalendarSystem = 'julian' | 'gregorian';
export type CalendarRule = {
  id: string;
  calendarSystem: CalendarSystem;
  tradition: string;
  jurisdiction: string;
} & ({type: 'fixed'; month: number; day: number} |
  {type: 'movable'; anchor: 'orthodox_pascha'; offsetDays: number} |
  {type: 'specific'; date: string});

function iso(date: Date) { return date.toISOString().slice(0, 10); }
export function parseCivilDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid civil date');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || iso(date) !== value) throw new Error('Invalid civil date');
  return date;
}
export function civilDays(year: number): string[] {
  if (!Number.isInteger(year) || year < 1583 || year > 4099) throw new Error('Supported years: 1583..4099');
  const days: string[] = [];
  const date = parseCivilDate(`${year}-01-01`);
  while (date.getUTCFullYear() === year) {
    days.push(iso(date)); date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

/** Julian computus; conversion uses the existing century-aware calendar utility. */
export function orthodoxPascha(year: number): string {
  civilDays(year);
  const d = (19 * (year % 19) + 15) % 30;
  const e = (2 * (year % 4) + 4 * (year % 7) - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = (d + e + 114) % 31 + 1;
  const target = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const found = civilDays(year).find(date => gregorianToJulianCalendarDate(date) === target);
  if (!found) throw new Error('Pascha resolution failed');
  return found;
}

export function resolveCalendarDay(civilDate: string, rules: CalendarRule[], options: {
  calendarSystem: CalendarSystem; tradition: string; jurisdiction?: string;
}): string[] {
  const date = parseCivilDate(civilDate);
  const year = date.getUTCFullYear();
  if (year < 1583 || year > 4099) throw new Error('Supported years: 1583..4099');
  const liturgicalDate = options.calendarSystem === 'julian' ? gregorianToJulianCalendarDate(civilDate) : civilDate;
  const [, month, day] = liturgicalDate.split('-').map(Number);
  let pascha: Date | undefined;
  return [...new Set(rules.filter(rule => {
    if (rule.tradition !== options.tradition || rule.calendarSystem !== options.calendarSystem ||
      (rule.jurisdiction !== '' && rule.jurisdiction !== (options.jurisdiction ?? ''))) return false;
    if (rule.type === 'fixed') return rule.month === month && rule.day === day;
    if (rule.type === 'specific') return rule.date === civilDate;
    if (rule.anchor !== 'orthodox_pascha' || !Number.isInteger(rule.offsetDays)) return false;
    pascha ??= parseCivilDate(orthodoxPascha(year));
    return Math.round((date.getTime() - pascha.getTime()) / 86400000) === rule.offsetDays;
  }).map(rule => rule.id))];
}
