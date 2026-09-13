import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { ChurchAlphabetLetterDto } from '@/lib/types';
vi.mock('./LanguageProvider', () => ({ useI18n: () => ({locale:'ru'}), useLocaleHref: () => (path: string) => '/ru'+path }));
vi.mock('next/link', () => ({default: ({children,...props}: React.ComponentProps<'a'>) => React.createElement('a',props,children)}));
import { SlavonicAlphabetPage } from './SlavonicAlphabetPage';
const letter = {id:'az',slug:'az',name:'Азъ',letter:'А',sortOrder:1,mainImageUrl:'media/alphabet/az/main.png',cardImageUrl:''} as ChurchAlphabetLetterDto;
it('uses the published main image and keeps the letter link unobstructed', () => {
 const html=renderToStaticMarkup(React.createElement(SlavonicAlphabetPage,{letters:[letter]}));
 expect(html).toContain('/media/alphabet/az/main.png');
 expect(html).toContain('href="/ru/staroslavyanskaya-azbuka/az"');
 expect(html).toContain('after:pointer-events-none');
});
it('prefers an explicitly supplied card image', () => {
 const html=renderToStaticMarkup(React.createElement(SlavonicAlphabetPage,{letters:[{...letter,cardImageUrl:'https://example.org/card.png'}]}));
 expect(html).toContain('src="https://example.org/card.png"');
 expect(html).not.toContain('/media/alphabet/az/main.png');
});
