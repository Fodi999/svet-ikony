import dataset from './historical-territories/prototype.json';
import type { CountryData } from './country-borders';
import type { ChurchVisualizerEventDto } from '@/lib/types';

export type HistoricalTerritory = {
  id: string; name: Record<'uk'|'ru'|'en', string>;
  periodStart: number; periodEnd: number; eventGroupIds?: string[];
  anchor: number[]; matchBounds: number[]; style: string;
  source: { kind: string; year: number; url: string; notes: string; license: string };
  geometry: CountryData['features'][number]['geometry'];
};
export const historicalTerritories = dataset as HistoricalTerritory[];
/** Editorial context, independent of modern country resolution. No title matching. */
export function territoryForEvent(event: ChurchVisualizerEventDto | null): HistoricalTerritory | null {
  if (!event || event.status !== 'published' || event.calendarEra === 'BC') return null;
  return historicalTerritories.find(territory => {
    if (territory.eventGroupIds?.includes(event.translationGroupId)) return true;
    if (event.yearStart == null || event.yearStart < territory.periodStart || event.yearStart > territory.periodEnd || event.latitude == null || event.longitude == null) return false;
    const [w,s,e,n] = territory.matchBounds;
    return event.longitude >= w && event.longitude <= e && event.latitude >= s && event.latitude <= n;
  }) ?? null;
}
export type AtlasMapLayer = 'events' | 'territories' | 'routes';
export const atlasMessages = {
  uk: { legend: 'Умовні позначення', territory: 'Історична територія', modern: 'Сучасні кордони держав', events: 'Події', territories: 'Території', routes: 'Маршрути', nearby: 'Події поруч', map: 'Події на карті', reconstruction: 'Історичні межі є реконструкцією та можуть відрізнятися залежно від джерела.', prototype: 'Локальна реконструкція', sourceYear: 'Карта-джерело', source: 'Джерело', noTerritory: 'Для цієї події немає історичного шару', noNearby: 'Інших подій у радіусі 500 км немає', image: 'Зображення події' },
  ru: { legend: 'Условные обозначения', territory: 'Историческая территория', modern: 'Современные границы государств', events: 'События', territories: 'Территории', routes: 'Маршруты', nearby: 'События рядом', map: 'События на карте', reconstruction: 'Исторические границы являются реконструкцией и могут различаться в зависимости от источника.', prototype: 'Локальная реконструкция', sourceYear: 'Карта-источник', source: 'Источник', noTerritory: 'Для этого события нет исторического слоя', noNearby: 'Других событий в радиусе 500 км нет', image: 'Изображение события' },
  en: { legend: 'Map legend', territory: 'Historical territory', modern: 'Modern country borders', events: 'Events', territories: 'Territories', routes: 'Routes', nearby: 'Nearby events', map: 'Events on map', reconstruction: 'Historical boundaries are reconstructed and may vary by source.', prototype: 'Local reconstruction', sourceYear: 'Source map', source: 'Source', noTerritory: 'No historical layer for this event', noNearby: 'No other events within 500 km', image: 'Event image' },
} as const;
/** Optional frontend presentation field; does not modify the API contract. */
export function eventImage(event: ChurchVisualizerEventDto): string | null {
  const value = (event as ChurchVisualizerEventDto & { imageUrl?: unknown }).imageUrl;
  if (typeof value !== 'string') return null;
  if (/^\/(?!\/)[^\\]*$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
