# CSS architecture

`app/globals.css` is only the composition entrypoint.

Единая тёмная «церковная» тема: токены (цвета, радиусы, тени, шрифты) объявлены в `shared/foundation.css` и используются везде через `var(...)`.

- `shared/foundation.css` — дизайн-токены (`--gold`, `--radius-*`, `--shadow-*`, `--font-*`), reset, базовая типографика (`html`/`body`/`a`/`img`/фокус/выделение), `.svg-icon`/`.brand-logo-image`. Всё остальное (каркасы страниц, кнопки, карточки, формы, читалки) переехало на Tailwind — см. `components/site/PageChrome.tsx`, `components/ui/{input,textarea}.tsx`, `components/site/AssetButton.tsx`.
- `tailwind-scope.css` — импортирует `tailwindcss/theme.css` + `tailwindcss/utilities.css` (без Preflight — см. комментарий в файле).

Правила:
- Цвета/радиусы/тени/шрифты — только через токены из `foundation.css`, без «сырых» hex-значений в новом коде (существующие Tailwind arbitrary-value hex-строки в мигрированных компонентах — исключение, задокументированное в плане миграции).
- Светлой темы нет: тема одна, тёмная.

## Миграция на Tailwind — завершена

Сайт полностью переехал с рукописного CSS на Tailwind v4 (scoped in через `tailwind-scope.css`). Все домены (`content.css`, `components.css`, `prayer-mode.css`) удалены; `foundation.css` сведён к токенам/reset. План и история миграции: `/Users/dmitrijfomin/.claude/plans/shiny-strolling-cook.md`.

Preflight (`tailwind-scope.css` → plain `"tailwindcss"`) ещё не включён — это отдельное, самое рискованное решение всей миграции, требует отдельного прохода регрессионного тестирования по всему сайту прежде чем его включать.
