import type { ChurchVisualizerEventDto } from '@/lib/types';
import { chronologicalOrder } from './chronology';

export type HistorySection = 'visualizer' | 'biblical' | 'church' | 'saints' | 'chronology' | 'map' | 'collections';
export const TIMELINE_ERAS = ['biblical', 'early', 'medieval', 'modern', 'contemporary'] as const;
export type TimelineEra = typeof TIMELINE_ERAS[number];
export function timelineEra(era: string): TimelineEra | 'other' {
  if (era.startsWith('biblical_')) return 'biblical';
  if (['apostolic', 'early_church'].includes(era)) return 'early';
  if (['byzantine', 'medieval'].includes(era)) return 'medieval';
  if (era === 'modern' || era === 'contemporary') return era;
  return 'other';
}
export function sectionEvents(events: ChurchVisualizerEventDto[], section: HistorySection) {
  return events.filter((event) => {
    if (event.status !== 'published') return false;
    if (section === 'biblical') return event.eventType === 'biblical' || timelineEra(event.era) === 'biblical';
    if (section === 'church') return ['church_history', 'council'].includes(event.eventType);
    if (section === 'saints') return event.eventType === 'saint';
    if (section === 'map') return event.latitude != null && event.longitude != null;
    if (section === 'collections') return event.isFeatured;
    return true;
  }).sort(chronologicalOrder);
}
