# CSS architecture

`app/globals.css` is only the composition entrypoint. Keep imports ordered because the site relies on normal CSS cascade.

Единая тёмная «церковная» тема: токены (цвета, радиусы, тени, шрифты) объявлены в `shared/foundation.css` и используются везде через `var(...)`.

- `shared/foundation.css` — дизайн-токены (`--gold`, `--radius-*`, `--shadow-*`, `--font-*`), reset, базовая типографика, каркасы страниц (`.page`, `.read-page`, `.detail-page`), герои и детальные layout-блоки.
- `shared/components.css` — **единая система кнопок** (`.btn` + алиасы всех старых классов кнопок: `.asset-button`, `.primary-button`, `.secondary-button` и кнопки читалки молитв) и **единая система карточек** (общий базис для `.icon-card`, `.sacred-panel`, `.daily-prayer-card` и др.), футер, PWA-промпт.
- `domains/content/content.css` — каталоги, детальные страницы, читалки, храмы.
- `domains/prayer-mode/prayer-mode.css` — остаток после частичной миграции (см. ниже); то, что ещё используется `LocalizedContent.tsx` напрямую (`.prayer-mode-hero`, `.sacred-read-page` и т.д.).

Правила:
- Новую кнопку или карточку не стилизуй с нуля — добавь селектор в соответствующую группу в `shared/components.css`.
- Цвета/радиусы/тени/шрифты — только через токены из `foundation.css`, без «сырых» hex-значений.
- Светлой темы нет: тема одна, тёмная.

## Постепенная миграция на Tailwind

Сайт переезжает с рукописного CSS на Tailwind v4 (scoped in через `tailwind-scope.css`, без Preflight — см. комментарий в файле) домен за доменом. План: `/Users/dmitrijfomin/.claude/plans/shiny-strolling-cook.md`.

Уже полностью на Tailwind (CSS-файлы удалены): старославянская азбука, календарь (`app/page.tsx` + `CalendarView.tsx`/`CalendarCards.tsx`), шапка сайта (`Header.tsx` + `LanguageSwitch`), shop/icon-order, часть prayer-mode. Остальное (`content.css`, `components.css`, `foundation.css`, остаток `prayer-mode.css`) — рукописный CSS, ещё не тронуто.
