import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }));
vi.mock('./LanguageProvider', async () => {
  const { translate, withLocale } = await import('@/lib/i18n');
  return {
    useI18n: () => ({ locale: 'uk' as const, t: (key: import('@/lib/i18n').TranslationKey) => translate('uk', key) }),
    useLocaleHref: () => (path: string) => withLocale(path, 'uk'),
  };
});

import { CalendarFeatureCard } from './CalendarCards';

/**
 * PHASE ADMIN-UX-1 follow-up: "ПРАЗДНИК ДНЯ" (CalendarFeatureCard) never
 * accepted an image at all -- it always showed the decorative BrandLogo
 * watermark (/brand-logo-mark.svg), even for a day whose own imageUrl was
 * already set and valid. This locks in the fix: the day's own photo wins
 * when present, the brand-logo watermark stays as the fallback when it
 * isn't -- mutually exclusive, never both at once.
 */
describe('CalendarFeatureCard image fallback', () => {
  const baseProps = {
    eyebrow: 'Праздник дня',
    title: '15 сентября: память мученика Маманта',
    date: '2026-09-15',
    oldDate: '2026-09-02 ст. ст.',
    link: { href: '/church/calendar/2026-09-15', label: 'Подробнее' },
  };

  it('renders the calendar day\'s own photo instead of the brand-logo placeholder when imageUrl is set', () => {
    const html = renderToString(
      React.createElement(CalendarFeatureCard, {
        ...baseProps,
        imageUrl: '/media/calendar/5c69805d-b7d3-4355-9f1f-87bdb73319cd/main/651f0610-b044-4fea-adef-f0694136bfca.png',
        imageAlt: baseProps.title,
      }),
    );
    expect(html).toContain('651f0610-b044-4fea-adef-f0694136bfca.png');
    expect(html).not.toContain('brand-logo-mark.svg');
  });

  it('falls back to the brand-logo placeholder when the day has no imageUrl yet', () => {
    const html = renderToString(React.createElement(CalendarFeatureCard, baseProps));
    expect(html).toContain('brand-logo-mark.svg');
  });

  it('still renders title/date/note/link unchanged whether or not an image is present', () => {
    const withImage = renderToString(
      React.createElement(CalendarFeatureCard, { ...baseProps, note: 'liturgical', imageUrl: '/media/calendar/x/main/y.png' }),
    );
    const withoutImage = renderToString(React.createElement(CalendarFeatureCard, { ...baseProps, note: 'liturgical' }));
    for (const html of [withImage, withoutImage]) {
      expect(html).toContain('15 сентября: память мученика Маманта');
      expect(html).toContain('2026-09-15');
      expect(html).toContain('2026-09-02 ст. ст.');
      expect(html).toContain('liturgical');
      expect(html).toContain('Подробнее');
    }
  });
});
