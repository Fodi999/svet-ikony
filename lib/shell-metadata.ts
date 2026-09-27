import type { Locale } from './i18n';
import { pageMetadata } from './seo';

const copy = {
  ru: {
    '/': ['Svet Ikony — православная карта, святыни и иконы', 'Откройте православные святыни на интерактивной карте: святые, храмы, календарь памятных дней, молитвы и коллекция икон.'],
    '/explore': ['Библиотека — жития, молитвы и история | Svet Ikony', 'Жития святых, молитвы, Евангелие, православный календарь и история икон в библиотеке Svet Ikony.'],
    '/about': ['О проекте | Svet Ikony', 'Svet Ikony объединяет православную карту, знания о святых и святынях и коллекцию икон. Узнайте о проекте.'],
  },
  uk: {
    '/': ['Svet Ikony — православна мапа, святині та ікони', 'Відкрийте православні святині на інтерактивній мапі: святі, храми, календар пам’ятних днів, молитви та колекція ікон.'],
    '/explore': ['Бібліотека — житія, молитви та історія | Svet Ikony', 'Житія святих, молитви, Євангеліє, православний календар та історія ікон у бібліотеці Svet Ikony.'],
    '/about': ['Про проєкт | Svet Ikony', 'Svet Ikony поєднує православну мапу, знання про святих і святині та колекцію ікон. Дізнайтеся про проєкт.'],
  },
  en: {
    '/': ['Svet Ikony — Orthodox map, sacred places and icons', 'Explore Orthodox sacred places on an interactive map: saints, churches, commemorations, prayers and a collection of icons.'],
    '/explore': ['Library — saints, prayers and history | Svet Ikony', 'Discover lives of saints, prayers, the Gospel, the Orthodox calendar and the history of icons in the Svet Ikony library.'],
    '/about': ['About the project | Svet Ikony', 'Svet Ikony brings together an Orthodox map, knowledge of saints and sacred places, and a collection of icons. Learn about the project.'],
  },
} as const;

export function shellMetadata(path: keyof typeof copy.ru, locale: Locale) {
  const [title, description] = copy[locale][path];
  return {
    ...pageMetadata({path, locale, title, description}),
    title: {absolute: title},
    twitter: {card: 'summary' as const, title, description},
  };
}
