# CSS architecture

`app/globals.css` is only the composition entrypoint. Keep imports ordered because the site still relies on normal CSS cascade.

- `shared/foundation.css` - design tokens, reset, base elements, legacy shared blocks.
- `shared/header.css` - global sticky site header, navigation, language switcher, header action.
- `shared/components.css` - reusable UI primitives shared by domains: asset buttons, legacy link buttons, footer.
- `domains/calendar/calendar.css` - calendar domain entrypoint; keep import order stable.
- `domains/calendar/layout.css` - calendar page shell, hero, filters, toolbar, month title.
- `domains/calendar/grid.css` - 7-column calendar grid and day poster cards.
- `domains/calendar/list.css` - list mode accordion rows and expanded panels.
- `domains/calendar/extras.css` - empty states, hidden today side card, service links under the calendar.
- `domains/calendar/responsive.css` - calendar, list, and service responsive rules.
- `domains/content/content.css` - generated/read/detail pages and content-specific galleries, readers, churches.

When adding new styles, prefer the domain file that owns the UI. Put reusable primitives in `shared/components.css`.
