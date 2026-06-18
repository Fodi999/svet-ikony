# CSS architecture

`app/globals.css` is only the composition entrypoint. Keep imports ordered because the site still relies on normal CSS cascade.

- `shared/foundation.css` - design tokens, reset, base elements, legacy shared blocks.
- `domains/calendar/calendar.css` - calendar page, month grid, filters, month switcher, calendar responsive rules.
- `domains/content/content.css` - generated/read/detail pages, site shell unification, final cross-page overrides.

When adding new styles, prefer the domain file that owns the UI. Put reusable primitives in `shared`.
