# CSS architecture

`app/globals.css` is only the composition entrypoint. Keep imports ordered because the site relies on normal CSS cascade.

Единая тёмная «церковная» тема: токены (цвета, радиусы, тени, шрифты) объявлены в `shared/foundation.css` и используются везде через `var(...)`.

- `shared/foundation.css` — дизайн-токены (`--gold`, `--radius-*`, `--shadow-*`, `--font-*`), reset, базовая типографика, каркасы страниц (`.page`, `.read-page`, `.detail-page`), герои и детальные layout-блоки.
- `shared/header.css` — липкая шапка, навигация, переключатель языка.
- `shared/components.css` — **единая система кнопок** (`.btn` + алиасы всех старых классов кнопок: `.asset-button`, `.primary-button`, `.secondary-button`, `.header-action` и кнопки читалки молитв) и **единая система карточек** (общий базис для `.icon-card`, `.sacred-panel`, `.daily-prayer-card`, `.calendar-hero-card` и др.), футер, PWA-промпт.
- `domains/calendar/calendar.css` — entrypoint календаря; порядок импортов стабильный.
- `domains/calendar/layout.css` — каркас календаря, герой, тулбар.
- `domains/calendar/grid.css` — 7-колоночная сетка и карточки дней.
- `domains/calendar/list.css` — режим списка (аккордеон).
- `domains/calendar/extras.css` — пустые состояния, сервисные ссылки.
- `domains/calendar/responsive.css` — адаптив календаря.
- `domains/content/content.css` — каталоги, детальные страницы, читалки, храмы.
- `domains/slavonic/slavonic.css` — страница старославянской азбуки.

Правила:
- Новую кнопку или карточку не стилизуй с нуля — добавь селектор в соответствующую группу в `shared/components.css`.
- Цвета/радиусы/тени/шрифты — только через токены из `foundation.css`, без «сырых» hex-значений.
- Светлой темы нет: тема одна, тёмная.
