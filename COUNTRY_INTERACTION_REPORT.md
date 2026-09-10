# Country interaction — 10 сентября 2026
Актуальный следующий этап UX: [Level 0 polish](LEVEL_0_POLISH_REPORT.md).

Реализовано локально в существующем разделе `/uk/pravoslavna-istoriya`.
Commit, push и deploy не выполнялись.

## COUNTRY DETECTION / POINT-IN-POLYGON

Pointer → Raycaster по твёрдой поверхности Earth → обратное преобразование
существующего geographic frame → latitude/longitude → bbox → point-in-polygon
→ код страны. Облака и атмосфера не участвуют в определении страны.
Опубликованные event pins сохраняют приоритет.

Индекс создаётся один раз и кешируется по объекту загруженного GeoJSON.
Каждый Polygon/MultiPolygon имеет подготовленные кольца и bbox. Долготы
разворачиваются через ±180°, внутренние кольца исключаются из попадания.
Representative point проверяется на принадлежность стране; при необходимости
выбирается внутренняя точка сканирующей строки. Для всех 239 индексированных
стран принадлежность representative point проверена тестом.

Обработка pointermove ограничена 40 Hz, обнаружение страны не выполняется
в постоянном render loop. После zoom положение под курсором пересчитывается.

## HIGHLIGHT

Использована существующая геометрия Natural Earth: триангуляция с отверстиями,
разбиение длинных рёбер до 1°, проекция треугольников на сферу радиуса ×1.0035.
Заливка gold с opacity 0.18 для hover / 0.26 для selection. Отдельные яркий
контур и небольшая золотая точка. Спутниковая текстура остаётся видимой.

Fill, outline и anchor имеют depthTest; Earth закрывает обратную сторону.
DoubleSide fill использует forceSinglePass. Общий переключатель границ не
отключает подсветку выбранной страны. Кеш ограничен четырьмя GPU-слоями,
вытесненные слои и ресурсы при unmount освобождаются.

## PERFORMANCE

Наблюдения в Chrome на этом Mac, локальная dev-страница, HQ Earth:

- Обычный глобус: 4 draw calls.
- Одна hovered/selected страна: 7 draw calls.
- Выбранная страна при Borders OFF: 6 draw calls.
- После завершения загрузок наблюдалось 58–60 FPS; во время параллельных
  проверок/сборки встречались значения 48–57 FPS.
- Зафиксированное время PIP в браузерном debug UI: 0.1–2.6 ms; финальный
  hover Украины — 0.2 ms. Это наблюдения локальной проверки, не гарантия
  частоты кадров на всех мобильных устройствах.

GeoJSON: 1,688,708 байт, gzip 570,586. Metadata: 59,652 байта, gzip 16,453.
Все 242 геометрии GeoJSON побайтно по JSON-значениям совпали с HEAD:
изменены только свойства/идентификаторы, не координаты границ.

## FLY-TO / RESET

Камера проходит кратчайшую сферическую дугу примерно за 1000 ms с ease-in-out.
Framing рассчитывается по representative point и angular extent основного
полигона, с учётом горизонтального/вертикального FOV и текущих безопасных
OrbitControls min/max limits. Нет отдельных дистанций по названиям стран.
Reduced motion учитывается. Pointer/wheel отменяет переход.

Reset очищает country selection/hover, убирает подсветку, возвращает обзорную
камеру плавно, без повторной загрузки GLB. Переходы событий сохранены и не
конкурируют с country fly-to. Автоматическое вращение базовой Earth не включено.

## PANEL / MOBILE / ACCESSIBILITY

Существующая правая колонка содержит настоящий HTML: флаг, название, континент,
столица, disabled-кнопки истории/событий/святых и честное пустое состояние.
Для клавиатуры доступен обычный select стран. Локализация uk/ru/en использует
существующий useI18n. `getCountryContent(countryCode)` возвращает unavailable
и null counts; D1-запросы/контент/счётчики не имитируются.

На мобильной ширине выбор на глобусе открывает существующий bottom sheet.
Исправлен двойной сдвиг DialogPopup: сброшены его штатные translate-утилиты,
позиционирование sheet осталось у нижнего края. В Chrome 390×844 панель
занимала x=0…390 и завершалась ровно на y=844. Проверены выбор Украины,
закрытие панели, Reset и перетаскивание без случайного выбора.

Порог drag — 6 CSS px. Жест с двумя указателями блокирует selection до
отпускания всех пальцев; следующий обычный tap снова работает. Эти touch/pinch
последовательности проверены автоматическими PointerEvent-тестами. Физический
телефон и реальный pinch-жест на его экране в этой сессии не использовались.

Desktop 1470×992: document height = viewport height = 992.
Mobile 390×844: document height = viewport height = 844.
Обычная прокрутка страницы не появилась. Debug UI условный, development only.

## VISUAL CHECKS

На реальной странице в Chrome визуально просмотрены Украина, Польша, Италия,
Франция, Турция, Египет, Израиль, Саудовская Аравия, Индия и ЮАР.
Проверены Сицилия/Сардиния, Корсика и отверстие Лесото в полигоне ЮАР.

Наведение после перемещения камеры:

| Точка | Координаты browser raycast | Hover |
|---|---|---|
| Украина | 48.6538, 31.8371 | UA |
| Израиль | 30.9111, 34.8479 | IL |
| Чёрное море | 43.8107, 34.4471 | отсутствует |
| Каспийское море | 41.9379, 50.8951 | отсутствует |
| Средиземное море | 33.4767, 25.3302 | отсутствует |

Mouse drag проверен на desktop и мобильной ширине: выбранная страна не
появлялась после отпускания указателя. Borders OFF сохранял подсветку ЮАР.

Скриншоты:

1. [Normal globe](artifacts/country-interaction/normal.png)
2. [Ukraine hover](artifacts/country-interaction/ukraine-hover.png)
3. [Ukraine selected](artifacts/country-interaction/ukraine-selected.png)
4. [Italy selected](artifacts/country-interaction/italy-selected.png)
5. [Mobile selected country](artifacts/country-interaction/mobile-selected.png)

## DATA / SCOPE

Использован прежний набор границ [Natural Earth Admin 0 1:50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/),
версия v5.1.2. Названия/коды — из него; столицы — из
[populated places той же версии](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_populated_places.geojson),
только ADM0CAP=1. CAPALT-only города не называются дополнительными столицами.
Отсутствующая столица отображается «—». Источник — [public domain](https://www.naturalearthdata.com/about/terms-of-use/).

239 features имеют ISO_A2_EH/ISO_A3_EH. Для Kosovo источник использует
пользовательский код XK. У Somaliland, Northern Cyprus и Siachen Glacier этих
кодов нет: их прежние границы сохранены, но отдельный выбор не включён.
Идентификаторы не выдуманы. Сохранена исходная de facto картографическая
конвенция Natural Earth; это не актуальная карта территориального контроля.

Earth GLB, R2, D1 schema, API contracts, route, lazy loading, WebGL2 fallback,
импорты Three.js и архитектура загрузки event GLB в этом этапе не заменялись.
Ранее находившиеся в рабочем дереве исправление калибровки HQ и отключение
автовращения сохранены; см. `HQ_CALIBRATION_FIX.md`.

## FILES CHANGED

Новые файлы:

- `lib/visualizer/countries.ts` — metadata API, preprocessing, bbox/PIP, future content hook.
- `lib/visualizer/country-camera.ts` — raycast/geography и fly-to.
- `lib/visualizer/country-highlight.ts` — сферические fill/outline/anchor.
- `lib/visualizer/country-interaction.ts` — pointer lifecycle, selection, cleanup.
- `lib/visualizer/country-metadata.json`, `country-messages.ts` — данные и тексты.
- `components/site/visualizer/CountryPanel.tsx` — HTML-панель и keyboard select.
- `lib/visualizer/countries.test.ts`, `country-interaction.test.ts` — проверки географии/жестов.
- `scripts/prepare-country-interaction.mjs` — воспроизводимая подготовка данных.
- Этот отчёт и `artifacts/country-interaction/*.png`.

Изменения интеграции:

- `components/site/visualizer/Earth3DCanvas.tsx`
- `components/site/visualizer/HistoryVisualizer.tsx` и `.test.ts`
- `components/site/visualizer/history.module.css`
- `lib/visualizer/country-borders.ts`, `lib/visualizer/README.md`
- `public/data/country-borders-50m.geojson` — коды в properties.
- `scripts/prepare-country-borders.mjs` — сохранение кодов при регенерации.

Другие видимые изменения в git status относятся к ранее выполненной HQ/manual
rotation правке: base-scene, сообщения загрузки, прежние тесты и снимки калибровки.
Админский репозиторий в этом этапе не менялся.

## TESTS

- `npm run typecheck` — PASS после финальной сборки.
- `npm test` — PASS, **982 теста в 97 файлах**.
- После последней CSS/JSX-правки мобильной панели повторены 9 UI-тестов — PASS.
- `npm run build` — PASS: Next.js production + OpenNext Cloudflare worker.
- `npm run lint` — без ошибок; существующие warnings в других файлах.
  Финальный eslint по всем изменённым country-файлам — без ошибок/warnings.
- `git diff --check` — PASS.

Начальная sandbox-сборка не смогла открыть служебный порт Turbopack;
повторная локальная сборка с разрешённым доступом завершилась успешно.
Остались прежние предупреждения middleware→proxy и duplicate `options`
в стороннем сгенерированном bundle. Они не блокируют сборку.
