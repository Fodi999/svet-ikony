import type { Locale } from '@/lib/i18n';
const uk = {
  visualizer: 'Візуалізатор', biblical: 'Біблійна історія', church: 'Історія Церкви', saints: 'Святі', chronology: 'Хронологія', map: 'Мапа подій', collections: 'Колекції',
  early: 'Рання Церква', medieval: 'Середньовіччя', modern: 'Новий час', contemporary: 'Сучасність', other: 'Інші епохи', all: 'Усі події',
  menu: 'Відкрити навігацію', close: 'Закрити', event: 'Подія', eventPanel: 'Відкрити інформацію про подію',
  choose: 'Оберіть подію на часовій шкалі або на глобусі', more: 'Дізнатися більше', scene: '3D сцена',
  zoomIn: 'Наблизити', zoomOut: 'Віддалити', reset: 'Початковий вигляд', fullscreen: 'На весь екран', exit: 'Вийти',
  hint: 'Обертайте глобус • Масштабуйте • Натискайте на події', timeline: 'Часова шкала',
  noEvents: 'У цьому розділі ще немає опублікованих подій.', featured: 'Вибрані редакцією події',
  navigation: 'Розділи історії', era: 'Епоха', century: 'Століття', year: 'Рік', allDates: 'Усі дати',
  overview: 'Огляд', read: 'Матеріал події', noImage: 'Історична подія', fullscreenFallback: 'Режим на весь екран. Escape — вийти.',
};
type Copy = { [K in keyof typeof uk]: string };
const ru: Copy = {
  visualizer: 'Визуализатор', biblical: 'Библейская история', church: 'История Церкви', saints: 'Святые', chronology: 'Хронология', map: 'Карта событий', collections: 'Коллекции',
  early: 'Ранняя Церковь', medieval: 'Средневековье', modern: 'Новое время', contemporary: 'Современность', other: 'Другие эпохи', all: 'Все события',
  menu: 'Открыть навигацию', close: 'Закрыть', event: 'Событие', eventPanel: 'Открыть информацию о событии',
  choose: 'Выберите событие на временной шкале или на глобусе', more: 'Узнать больше', scene: '3D сцена',
  zoomIn: 'Приблизить', zoomOut: 'Отдалить', reset: 'Начальный вид', fullscreen: 'На весь экран', exit: 'Выйти',
  hint: 'Вращайте глобус • Масштабируйте • Нажимайте на события', timeline: 'Временная шкала',
  noEvents: 'В этом разделе ещё нет опубликованных событий.', featured: 'Избранные редакцией события',
  navigation: 'Разделы истории', era: 'Эпоха', century: 'Век', year: 'Год', allDates: 'Все даты',
  overview: 'Обзор', read: 'Материал события', noImage: 'Историческое событие', fullscreenFallback: 'Режим на весь экран. Escape — выйти.',
};
const en: Copy = {
  visualizer: 'Visualizer', biblical: 'Biblical history', church: 'Church history', saints: 'Saints', chronology: 'Chronology', map: 'Event map', collections: 'Collections',
  early: 'Early Church', medieval: 'Middle Ages', modern: 'Modern age', contemporary: 'Contemporary', other: 'Other eras', all: 'All events',
  menu: 'Open navigation', close: 'Close', event: 'Event', eventPanel: 'Open event information',
  choose: 'Choose an event on the timeline or the globe', more: 'Learn more', scene: '3D scene',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset camera', fullscreen: 'Fullscreen', exit: 'Exit',
  hint: 'Rotate the globe • Zoom • Select events', timeline: 'Timeline',
  noEvents: 'There are no published events in this section yet.', featured: 'Editorial selections',
  navigation: 'History sections', era: 'Era', century: 'Century', year: 'Year', allDates: 'All dates',
  overview: 'Overview', read: 'Event article', noImage: 'Historical event', fullscreenFallback: 'Fullscreen mode. Press Escape to exit.',
};
export const explorerMessages: Record<Locale, Copy> = { uk, ru, en };
