// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchVisualizerEventDto } from '@/lib/types';
const harness = vi.hoisted(() => ({ target: null as unknown, mobile: false }));
vi.mock('@/components/site/LanguageProvider', async () => {
  const { translate } = await import('@/lib/i18n');
  return { useI18n: () => ({ locale: 'uk', t: (key: import('@/lib/i18n').TranslationKey) => translate('uk', key) }) };
});
vi.mock('./Earth3DCanvas', () => ({ Earth3DCanvas: (props: { selectedEvent: unknown }) => { harness.target = props.selectedEvent; return React.createElement('canvas'); } }));
import { HistoryVisualizer } from './HistoryVisualizer';

function event(id: string, overrides: Partial<ChurchVisualizerEventDto> = {}): ChurchVisualizerEventDto {
  return { id, siteId: 'site', slug: id, language: 'uk', translationGroupId: id, title: `Подія ${id}`, summary: 'Короткий опис', description: 'Повний текст події', eventType: 'church_history', chronologyType: 'exact', era: 'early_church', calendarEra: 'AD', yearStart: 313, yearEnd: null, century: 4, displayDate: '', sortYear: 313, locationName: 'Місце', latitude: 40, longitude: 20, calendarDayId: null, status: 'published', isFeatured: false, isGlobal: true, createdAt: '', updatedAt: '', publishedAt: '', ...overrides };
}
const events = [event('a'), event('b', { eventType: 'biblical', era: 'biblical_old_testament', calendarEra: 'BC', yearStart: 500, century: 5, sortYear: -500 }), event('draft', { status: 'draft' })];
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  harness.mobile = false;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  window.matchMedia = vi.fn(() => ({ matches: harness.mobile, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true, media: '', onchange: null }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ models: [{ isBaseEarth: false, url: '/media/event.glb' }] }) })));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount() { await act(async () => root.render(React.createElement(HistoryVisualizer, { events, baseEarthModelUrl: '/earth.glb' }))); }
function button(label: string) { const value = [...container.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label); if (!value) throw new Error(`Missing button ${label}`); return value; }
async function click(element: Element) { await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }

describe('history explorer', () => {
  it('server-renders headings and real published event metadata without loading GLBs', () => {
    const html = renderToString(React.createElement(HistoryVisualizer, { events, baseEarthModelUrl: null }));
    expect(html).toContain('<h1>Православна історія</h1>');
    expect(html).toContain('Інтерактивна історія Біблії');
    expect(html).toContain('Подія a'); expect(html).toContain('313'); expect(html).toContain('Місце');
    expect(html).not.toContain('Подія draft'); expect(fetch).not.toHaveBeenCalled();
  });
  it('loads model metadata only on selection and filters sections without invented entries', async () => {
    await mount(); expect(fetch).not.toHaveBeenCalled();
    await click(button('313 н. е. — Подія a'));
    expect(fetch).toHaveBeenCalledOnce();
    expect(harness.target).toMatchObject({ modelUrl: '/media/event.glb' });
    await click(button('Біблійна історія'));
    expect(container.textContent).toContain('Подія b');
    expect(container.textContent).not.toContain('Подія a');
    expect(harness.target).toBeNull();
    await click(button('Колекції'));
    expect(container.textContent).toContain('ще немає опублікованих подій');
  });
  it('uses CSS fullscreen when the API is unavailable and exits on Escape', async () => {
    await mount(); await click(button('На весь екран'));
    expect(container.querySelector('main')?.dataset.expanded).toBe('true');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(container.querySelector('main')?.dataset.expanded).toBe('false');
    expect(document.activeElement).toBe(button('На весь екран'));
  });
  it('restores the layout after native fullscreen exits', async () => {
    await mount();
    const main = container.querySelector('main')!;
    Object.defineProperty(main, 'requestFullscreen', { value: vi.fn(async () => {}) });
    await click(button('На весь екран'));
    expect(main.requestFullscreen).toHaveBeenCalledOnce();
    await act(async () => { document.dispatchEvent(new Event('fullscreenchange')); });
    expect(main.dataset.expanded).toBe('false');
  });
  it('opens an accessible bottom sheet on mobile event selection', async () => {
    harness.mobile = true; await mount(); await click(button('313 н. е. — Подія a'));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Подія a');
    expect(dialog.querySelector('[aria-label="Закрити"]')).not.toBeNull();
    await click(dialog.querySelector('[aria-label="Закрити"]')!);
    expect(button('Відкрити інформацію про подію').getAttribute('aria-expanded')).toBe('false');
  });
});
