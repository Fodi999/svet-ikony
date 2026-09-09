# Публичная история: экранный интерактивный режим

Изменения только в `svet-ikony`. После локальной проверки пользователь
отдельно разрешил commit / push сообщением «пушим». Ручной deploy не выполнялся.

## Desktop

Вместо большого hero — компактные H1 и описание. Основной экран занимает
`100dvh` за вычетом реальной высоты header (ResizeObserver). Слева навигация
220–250px, справа событие 320–370px, между ними сцена; снизу timeline 180px.
Панели имеют собственную прокрутку при длинном содержимом. В immersive mode
footer и PWA-приглашение скрыты CSS, ограниченным только маршрутом истории.

Меню фильтрует реальные published events: библейские, церковные, святые,
с координатами; «Колекції» показывает редакционные `isFeatured`. Хронология
поддерживает эпохи, века, годы, неизвестные даты и разделение BC/AD.
Новых исторических записей, таблиц или искусственного контента не добавлено.

## Mobile / tablet

Ниже 1200px обе боковые панели открываются по кнопкам. Навигация — drawer,
событие — bottom sheet с ограниченной высотой и собственной прокруткой.
На мобильных компактнее общий header и toolbar; timeline листается
горизонтально. В обычном портретном viewport сцена получает оставшуюся
высоту, примерно 55–65dvh. Для низких экранов дополнительно сокращаются
toolbar и timeline. Ширина страницы не зависит от длины карточек.

## Fullscreen

`immersiveMode` включает скрытие внешних элементов. Кнопка fullscreen
вызывает Fullscreen API, одновременно включая CSS-режим на весь viewport.
Если API отсутствует или отклоняет запрос, CSS-режим остаётся доступным.
Выход — кнопка и Escape. Событие `fullscreenchange` синхронизирует UI после
нативного выхода. Диалоги монтируются внутри fullscreen-контейнера и имеют
focus trap/закрытие через существующий Base UI Dialog.

## Active history nav

Header определяет активность по `usePathname()` и существующему
`stripLocaleFromPathname()`. Для истории добавлены золотое свечение,
тонкая рамка и `aria-current="page"`; золотой фон и тёмный текст сохранены.
На узком header активная история прокручивается в видимую область меню.
При выходе из истории прежняя позиция навигации восстанавливается.
Существующие ссылки и языковая маршрутизация сохранены.

## Event panel / данные

Показаны период, тип датировки, название, место, summary; «Дізнатися більше»
открывает полный текст. «3D сцена» доступна только при наличии модели.
Кнопка хронологии переводит фокус на timeline. В текущей схеме нет изображений,
связанных молитв и галерей: вместо выдуманных фото используются нейтральные
иконки событий; отсутствующие связи не превращаются в пустые кнопки.

## SEO

Существующий серверный page.tsx, metadata и Hreflang не изменены. H1,
описание, названия опубликованных событий, даты, места и summary присутствуют
в первоначальном SSR HTML. Canvas остаётся отдельным визуальным слоем.

## Performance / 3D

Переиспользован Earth3DCanvas. Сохранены Base Earth, её камера/анимация,
dynamic import Three.js, загрузка event GLB при выборе, DPR clamp,
visibility pause, WebGL2 fallback и освобождение ресурсов.
Добавлены команды zoom/reset и лёгкие маркеры с общей геометрией/материалом.
Raycast выполняется только при нажатии; drag не выбирает событие. Маркеры
дальнего полушария скрыты. Клавиатурная альтернатива — кнопки timeline.
Новых production-зависимостей нет; jsdom добавлен только для тестов.

## Проверки

- TypeScript: успешно.
- Все 936 тестов в 94 файлах: успешно.
- Lint: 0 ошибок; в проекте остаются 24 предупреждения.
- Production build: OpenNext Worker собран успешно.
- Реальный локальный `/uk/pravoslavna-istoriya`: HTTP 200, SSR содержит
  H1, описание, timeline и активную ссылку навигации.
- Регрессии: четыре варианта history URL, SSR published-only, фильтры,
  lazy loading, CSS/native fullscreen exit, mobile bottom sheet, zoom,
  выбор маркера и отсутствие выбора при drag.
- Визуальная проверка desktop/mobile браузером недоступна: среда не имеет
  разрешения Computer Use для Chrome. DOM/Three.js-тесты не заменяют её.

## Changed files

- `components/site/Header.tsx`, `Header.test.ts`: активность и видимость ссылки.
- `components/site/PWAInstallPrompt.tsx`: атрибут для scoped immersive CSS.
- `components/site/visualizer/HistoryVisualizer.tsx`: интерфейс, фильтры и панели.
- `components/site/visualizer/history.module.css`: адаптивные стили только истории.
- `components/site/visualizer/HistoryVisualizer.test.ts`: DOM/SSR-регрессии.
- `components/site/visualizer/Earth3DCanvas.tsx`, `Earth3DCanvas.test.ts`: fill,
  команды камеры, маркеры и регрессии.
- `lib/visualizer/era-labels.ts`: переиспользованные переводы эпох.
- `lib/visualizer/explorer.ts`, `explorer.test.ts`: фильтрация published events.
- `lib/visualizer/explorer-messages.ts`: новые подписи UK/RU/EN.
- `package.json`, `package-lock.json`: тестовая зависимость jsdom.
- `HISTORY_IMMERSIVE_REPORT.md`: этот отчёт.
