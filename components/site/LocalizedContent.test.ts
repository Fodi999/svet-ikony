import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Saint } from '@/lib/types';

vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }));
vi.mock('./LanguageProvider', async () => {
  const { translate, withLocale } = await import('@/lib/i18n');
  return {
    useI18n: () => ({ locale: 'uk' as const, t: (key: import('@/lib/i18n').TranslationKey) => translate('uk', key) }),
    useLocaleHref: () => (path: string) => withLocale(path, 'uk'),
  };
});

import { LocalizedSaintDetail } from './LocalizedContent';

function baseSaint(overrides: Partial<Saint> = {}): Saint {
  return {
    id: 'saint-1',
    slug: 'muchenyk-andrii',
    name: 'Мученик Андрій Стратилат',
    shortDescription: '',
    biography: 'Текст життєпису.',
    feastDayOldStyle: '',
    feastDayNewStyle: '',
    imageUrl: '',
    relatedIcons: [],
    prayers: [],
    status: 'published',
    ...overrides,
  };
}

describe('LocalizedSaintDetail calendar-day cross-link', () => {
  it('links to the saint\'s calendar day when one is known (the previously-missing cross-link)', () => {
    const html = renderToString(
      React.createElement(LocalizedSaintDetail, {
        saint: baseSaint({ calendarDay: { date: '2026-09-14', title: 'Положення чесного пояса Пресвятої Богородиці' } }),
      }),
    );
    expect(html).toContain('href="/uk/church/calendar/2026-09-14"');
    expect(html).toContain('Положення чесного пояса Пресвятої Богородиці');
  });

  it('renders no calendar-day link when the saint has none, without crashing', () => {
    const html = renderToString(React.createElement(LocalizedSaintDetail, { saint: baseSaint({ calendarDay: null }) }));
    expect(html).not.toContain('/church/calendar/');
  });

  it('still shows the related-content section for icons/prayers even with no calendar day', () => {
    const html = renderToString(React.createElement(LocalizedSaintDetail, { saint: baseSaint({ calendarDay: null, relatedIcons: ['icon-1'] }) }));
    expect(html).toContain('href="/uk/icons/icon-1"');
  });
});
