// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchVisualizerEventDto } from '@/lib/types';
import { TimelineScrubber } from './TimelineScrubber';
import { scrubberPercent } from '@/lib/visualizer/timeline-position';
import styles from './history.module.css';

vi.mock('@/components/site/LanguageProvider', () => ({ useI18n: () => ({ locale: 'uk' as const }) }));

function event(id: string, yearStart: number, title = id): ChurchVisualizerEventDto {
  return { id, siteId: 'site', slug: id, language: 'uk', translationGroupId: id, title, summary: '', description: '', eventType: 'church_history', chronologyType: 'exact', era: 'early_church', calendarEra: 'AD', yearStart, yearEnd: null, century: null, displayDate: '', sortYear: yearStart, locationName: '', latitude: null, longitude: null, calendarDayId: null, status: 'published', isFeatured: false, isGlobal: true, createdAt: '', updatedAt: '', publishedAt: '' };
}

const events = [event('nicaea', 325), event('kyiv', 988), event('constantinople', 1453), event('tomos', 2019)];

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 300, top: 0, height: 34, right: 300, bottom: 34, x: 0, y: 0, toJSON() {} });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mount(selectedEventId: string | null, onSelect: (id: string) => void, list = events) {
  await act(async () => root.render(React.createElement(TimelineScrubber, { events: list, selectedEventId, onSelect })));
}
function track() { return container.getElementsByClassName(styles.scrubberTrack)[0] as HTMLDivElement; }
function handle() { return container.getElementsByClassName(styles.scrubberHandle)[0] as HTMLButtonElement | undefined; }
function xFor(index: number, count = events.length) { return (index / (count - 1)) * 300; }
async function pointer(type: string, clientX: number, pointerId = 1) {
  await act(async () => { track().dispatchEvent(new PointerEvent(type, { clientX, pointerId, bubbles: true })); });
}

describe('TimelineScrubber', () => {
  it('renders nothing for an empty event list', async () => {
    await mount(null, vi.fn(), []);
    expect(container.innerHTML).toBe('');
  });
  it('renders one tick per visible event', async () => {
    await mount(null, vi.fn());
    expect(container.getElementsByClassName(styles.scrubberTick)).toHaveLength(4);
  });
  it('selects the nearest event on a plain click (no move)', async () => {
    const onSelect = vi.fn();
    await mount(null, onSelect);
    await pointer('pointerdown', xFor(2));
    await pointer('pointerup', xFor(2));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('constantinople');
  });
  it('calls onSelect exactly once, on release, even after several intermediate moves', async () => {
    const onSelect = vi.fn();
    await mount(null, onSelect);
    await pointer('pointerdown', xFor(0));
    await pointer('pointermove', xFor(1));
    await pointer('pointermove', xFor(2));
    await pointer('pointerup', xFor(3));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('tomos');
  });
  it('selects nothing when the drag is cancelled', async () => {
    const onSelect = vi.fn();
    await mount(null, onSelect);
    await pointer('pointerdown', xFor(2));
    await pointer('pointercancel', xFor(2));
    await pointer('pointerup', xFor(2));
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('moves the handle when selectedEventId changes externally, with no pointer interaction', async () => {
    await mount('nicaea', vi.fn());
    expect(handle()!.style.getPropertyValue('--scrubber-position')).toBe(`${scrubberPercent(0, 4)}%`);
    await mount('constantinople', vi.fn());
    expect(handle()!.style.getPropertyValue('--scrubber-position')).toBe(`${scrubberPercent(2, 4)}%`);
  });
  it('does not re-fire onSelect when releasing back onto the already-selected event', async () => {
    const onSelect = vi.fn();
    await mount('nicaea', onSelect);
    await pointer('pointerdown', xFor(0));
    await pointer('pointerup', xFor(0));
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('moves with ArrowRight/ArrowLeft/Home/End and skips no-op reselection', async () => {
    const onSelect = vi.fn();
    await mount('kyiv', onSelect);
    await act(async () => { handle()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(onSelect).toHaveBeenLastCalledWith('constantinople');
    await act(async () => { handle()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(onSelect).toHaveBeenLastCalledWith('nicaea');
    await act(async () => { handle()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); });
    expect(onSelect).toHaveBeenLastCalledWith('tomos');
    onSelect.mockClear();
    await act(async () => { handle()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
    expect(onSelect).toHaveBeenCalledOnce();
    onSelect.mockClear();
    await mount('nicaea', onSelect);
    await act(async () => { handle()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); });
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('never selects anything for a single-event list, even while dragging', async () => {
    const onSelect = vi.fn();
    await mount(null, onSelect, [events[0]]);
    await pointer('pointerdown', 150, 1);
    await pointer('pointermove', 0, 1);
    await pointer('pointerup', 300, 1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
