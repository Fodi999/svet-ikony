import React from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/church/calendar/2026-09-01', useRouter: () => ({ push() {}, refresh() {} }) }));
import { LanguageProvider, useI18n } from './LanguageProvider';
function Label() { return React.createElement('span', null, useI18n().locale); }
it('uses the server locale even when the rewritten pathname has no locale', () => {
  const html = renderToString(React.createElement(LanguageProvider, { initialLocale: 'en' }, React.createElement(Label)));
  expect(html).toContain('>en<');
});
