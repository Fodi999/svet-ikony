import { describe, expect, it } from 'vitest';
import type { ChurchVisualizerEventDto } from '@/lib/types';
import { sectionEvents, timelineEra } from './explorer';
const item = (overrides: Partial<ChurchVisualizerEventDto>) => ({ id: 'event', status: 'published', era: 'custom', sortYear: 0, latitude: null, longitude: null, ...overrides }) as ChurchVisualizerEventDto;
describe('real history events', () => {
  it('excludes drafts and sorts BC before AD without assuming precise dates', () => {
    const events = [item({ id: 'ad', sortYear: 10 }), item({ id: 'draft', status: 'draft' }), item({ id: 'bc', sortYear: -10 })];
    expect(sectionEvents(events, 'visualizer').map((event) => event.id)).toEqual(['bc', 'ad']);
  });
  it('keeps unknown dates and only maps coordinates that exist, including zero', () => {
    expect(sectionEvents([item({ latitude: 0, longitude: 0 }), item({ latitude: null })], 'map')).toHaveLength(1);
    expect(timelineEra('custom')).toBe('other');
    expect(timelineEra('biblical_creation')).toBe('biblical');
    expect(sectionEvents([item({ isFeatured: true }), item({})], 'collections')).toHaveLength(1);
  });
});
