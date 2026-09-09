import { ApiError } from '@/lib/d1/errors';
import type { ChurchVisualizerEventPayload } from '@/lib/d1/repositories/visualizerEvents';

export function validateEvent(payload: ChurchVisualizerEventPayload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw ApiError.validation('Очікується подія');
  const enums = {
    eventType: ['biblical', 'church_history', 'historical', 'saint', 'council', 'location', 'other'],
    chronologyType: ['exact', 'approximate', 'traditional', 'period', 'unknown'],
    era: ['biblical_creation', 'biblical_old_testament', 'biblical_new_testament', 'apostolic', 'early_church', 'byzantine', 'medieval', 'modern', 'contemporary', 'custom'],
    calendarEra: ['BC', 'AD', 'unknown'], status: ['draft', 'published', 'archived'], language: ['uk', 'ru', 'en'],
  };
  for (const [key, values] of Object.entries(enums)) {
    const value = payload[key as keyof typeof enums];
    if (value !== undefined && !values.includes(value)) throw ApiError.validation(`Некоректне поле ${key}`);
  }
  for (const key of ['yearStart', 'yearEnd', 'century', 'sortYear'] as const) {
    const value = payload[key];
    if (value != null && (!Number.isSafeInteger(value) || (key !== 'sortYear' && value < 1))) throw ApiError.validation(`Некоректне поле ${key}`);
  }
  for (const [key, limit] of [['latitude', 90], ['longitude', 180]] as const) {
    const value = payload[key];
    if (value != null && (!Number.isFinite(value) || Math.abs(value) > limit)) throw ApiError.validation(`Некоректне поле ${key}`);
  }
  for (const [key, limit] of [['title', 200], ['slug', 200], ['summary', 500], ['description', 5000], ['displayDate', 200], ['locationName', 200]] as const) {
    const value = payload[key];
    if (value !== undefined && (typeof value !== 'string' || value.length > limit)) throw ApiError.validation(`Некоректне поле ${key}`);
  }
  if (payload.yearStart != null && payload.yearEnd != null) {
    const sign = payload.calendarEra === 'BC' ? -1 : 1;
    if (sign * payload.yearEnd < sign * payload.yearStart) throw ApiError.validation('Кінець періоду має бути після початку');
  }
}
