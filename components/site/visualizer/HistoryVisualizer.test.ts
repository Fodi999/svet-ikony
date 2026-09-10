// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChurchVisualizerEventDto } from '@/lib/types';
const harness = vi.hoisted(() => ({ target: null as unknown, country: null as string | null, selectCountry: (() => {}) as (code: string) => void, mobile: false, locale: 'uk' as 'uk'|'ru'|'en' }));
vi.mock('@/components/site/LanguageProvider', async () => {
  const { translate } = await import('@/lib/i18n');
  return { useI18n: () => ({ locale: harness.locale, t: (key: import('@/lib/i18n').TranslationKey) => translate(harness.locale, key) }) };
});
vi.mock('./Earth3DCanvas', () => ({ Earth3DCanvas: (props: { selectedEvent: unknown; selectedCountryCode: string | null; onSelectCountry: (code: string) => void }) => { harness.target = props.selectedEvent; harness.country = props.selectedCountryCode; harness.selectCountry = props.onSelectCountry; return React.createElement('canvas'); } }));
import { HistoryVisualizer } from './HistoryVisualizer';

function event(id: string, overrides: Partial<ChurchVisualizerEventDto> = {}): ChurchVisualizerEventDto {
  return { id, siteId: 'site', slug: id, language: 'uk', translationGroupId: id, title: `Подія ${id}`, summary: 'Короткий опис', description: 'Повний текст події', eventType: 'church_history', chronologyType: 'exact', era: 'early_church', calendarEra: 'AD', yearStart: 313, yearEnd: null, century: 4, displayDate: '', sortYear: 313, locationName: 'Місце', latitude: 40, longitude: 20, calendarDayId: null, status: 'published', isFeatured: false, isGlobal: true, createdAt: '', updatedAt: '', publishedAt: '', ...overrides };
}
const events = [event('a'), event('b', { eventType: 'biblical', era: 'biblical_old_testament', calendarEra: 'BC', yearStart: 500, century: 5, sortYear: -500 }), event('draft', { status: 'draft' })];
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  harness.mobile = false; harness.locale = 'uk';
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
  it.each([
    ['UA','Україна','Украина','Ukraine'],['PL','Польща','Польша','Poland'],
    ['IT','Італія','Италия','Italy'],['FR','Франція','Франция','France'],
    ['NE','Нігер','Нигер','Niger'],['EG','Єгипет','Египет','Egypt'],
    ['IL','Ізраїль','Израиль','Israel'],['SA','Саудівська Аравія','Саудовская Аравия','Saudi Arabia'],
    ['IN','Індія','Индия','India']
  ])('preserves %s selection while switching localized panel text', async (code,uk,ru,en) => {
    await mount(); await act(async () => harness.selectCountry(code));
    for (const [locale,name] of [['uk',uk],['ru',ru],['en',en]] as const) {
      harness.locale = locale; await mount();
      expect(harness.country).toBe(code); expect(harness.target).toBeNull();
      expect(container.querySelector('[data-country-code] h2')?.textContent).toBe(name);
      expect(container.querySelectorAll('[data-country-code] button:disabled')).toHaveLength(3);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('localizes capital, continent and controls without clearing country selection', async () => {
    await mount(); await act(async () => harness.selectCountry('UA'));
    for (const [locale,capital,continent,reset,borders,fullscreen] of [
      ['uk','Київ','Європа','Початковий вигляд','Кордони','На весь екран'],
      ['ru','Киев','Европа','Начальный вид','Границы','На весь экран'],
      ['en','Kyiv','Europe','Reset camera','Borders','Fullscreen']
    ] as const) {
      harness.locale = locale; await mount();
      const panel = container.querySelector('[data-country-code="UA"]')!;
      expect(panel.querySelector('dd')?.textContent).toBe(capital);
      expect(panel.textContent).toContain(continent);
      expect(button(reset)).toBeDefined(); expect(button(fullscreen)).toBeDefined();
      expect([...container.querySelectorAll('button')].some(el=>el.textContent===borders)).toBe(true);
    }
  });
  it('selects real countries, switches from events, and resets without content requests', async () => {
    await mount();
    await act(async () => harness.selectCountry('UA'));
    expect(harness.country).toBe('UA');
    expect(button('Закрити країну')).toBeDefined();
    expect(container.querySelector('[data-country-code="UA"]')?.textContent).toContain('Київ');
    expect(container.querySelector('[aria-label="Історія: Україна"]')?.hasAttribute('disabled')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    await click(button('313 н. е. — Подія a'));
    expect(harness.country).toBeNull();
    await act(async () => harness.selectCountry('IT'));
    expect(harness.target).toBeNull();
    expect(container.querySelector('[data-country-code="IT"]')?.textContent).toContain('Рим');
    await click(button('Початковий вигляд'));
    expect(harness.country).toBeNull();
    expect(container.textContent).toContain('Оберіть країну на глобусі');
  });
  it('opens the existing mobile sheet for a country and closes with Escape', async () => {
    harness.mobile = true; await mount();
    await act(async () => harness.selectCountry('UA'));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Україна');
    expect(dialog.textContent).toContain('Київ');
    expect(dialog.querySelector('[aria-label="Закрити країну"]')).toBeNull();
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.country).toBe('UA');
  });
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
  it('collapses the navigation without removing accessible section buttons', async () => {
    await mount(); await click(button('Згорнути меню'));
    expect(container.querySelector('main')?.dataset.navCollapsed).toBe('true');
    expect(button('Історія Церкви').getAttribute('aria-label')).toBe('Історія Церкви');
    await click(button('Розгорнути меню'));
    expect(container.querySelector('main')?.dataset.navCollapsed).toBe('false');
  });
  it('uses the compact empty timeline and expands when published events arrive', async () => {
    await act(async () => root.render(React.createElement(HistoryVisualizer, { events: [], baseEarthModelUrl: null })));
    expect(container.querySelector('main')?.dataset.emptyTimeline).toBe('true');
    expect(container.textContent).toContain('Подій ще не додано');
    expect(container.querySelector('main')?.dataset.eventSelected).toBe('false');
    await mount();
    expect(container.querySelector('main')?.dataset.emptyTimeline).toBe('false');
    await click(button('313 н. е. — Подія a'));
    expect(container.querySelector('main')?.dataset.eventSelected).toBe('true');
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
