# svet-ikony — сайт «Світ Ікони» (svetikony.com)

Next.js 16 + OpenNext на Cloudflare Workers. Данные — D1 (`svetikony-production`),
медиа — R2 (`svetikony-media`). Этот же Worker — API для админ-панели
(`svetikony-admin`, репозиторий рядом).

## Локальный запуск

| Проект | Команда | Адрес |
|---|---|---|
| сайт + API (этот) | `npm run dev` | http://localhost:3000 |
| админ-панель | `npm run dev` в `svetikony-admin` | http://localhost:3001 |

- `.env.local` — публичные переменные (`NEXT_PUBLIC_SITE_URL`, Cesium token), шаблон — `.env.example`.
- `.dev.vars` — локальные секреты Worker (`ADMIN_JWT_SECRET`, Telegram, OpenAI, `SITE_URL`, `ADMIN_PANEL_URL`).
- Админка ходит сюда через `SVET_IKONY_API_BASE_URL=http://localhost:3000` и токен
  `SVET_IKONY_ADMIN_TOKEN` — JWT, подписанный этим же `ADMIN_JWT_SECRET`.
- Локальная база D1 и её данные — в `.wrangler/state` (не удалять), локальные загрузки — `public/media/`.

## Команды

```bash
npm run dev         # разработка
npm run typecheck   # tsc
npm run lint        # eslint
npm test            # vitest
npm run build       # сборка OpenNext (.open-next/)
npm run deploy      # сборка + деплой на Cloudflare
```

Кэши `.next/`, `.open-next/`, `.next-earth-preview/` создаются заново при сборке — их можно удалять.

## Документация

Архитектура глобуса, Cesium, календаря и источников данных — в [`docs/`](docs/).
Одноразовые отчёты этапов удалены из рабочей копии, они есть в истории git.
