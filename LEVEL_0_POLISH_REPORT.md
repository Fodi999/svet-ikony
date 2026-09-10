# Level 0 — country UX polish

Завершено локально 10 сентября 2026. Commit / push / deploy не выполнялись.
Этот этап продолжает `COUNTRY_INTERACTION_REPORT.md`: новый GLB, новые уровни
детализации, R2/D1, калибровка, API и схема страницы не менялись.

## CHANGED FILES

| Файл | Изменение этого этапа |
|---|---|
| `lib/visualizer/country-interaction.ts` | Измерение/размещение tooltip, обновление языка без движения указателя, курсоры, secondary click, восстановление hover после pinch, мягкость подсветки |
| `lib/visualizer/country-highlight.ts` | Более мягкая начальная прозрачность hover |
| `lib/visualizer/country-messages.ts` | Уточнены английские empty state и tooltip |
| `components/site/visualizer/Earth3DCanvas.tsx` | Общий стиль tooltip и обновление его перевода без пересоздания сцены |
| `components/site/visualizer/CountryPanel.tsx` | Более лёгкая панель, читаемые disabled-действия без стрелок, memoized список стран, одна кнопка закрытия в mobile sheet |
| `components/site/visualizer/HistoryVisualizer.tsx` | Mobile close и корректное позиционирование существующего drawer |
| `components/site/visualizer/history.module.css` | Типографика/цвета панели и tooltip, компактная шапка планшета |
| `components/site/LanguageProvider.tsx` | Активный язык с видимой золотой подложкой и aria-pressed; навигационная логика сохранена |
| `components/site/Hreflang.tsx` | Канонический React hrefLang в development, прежний lowercase hreflang в production |
| `country-interaction.test.ts`, `countries.test.ts`, `HistoryVisualizer.test.ts`, `Earth3DCanvas.test.ts`, `Hreflang.test.ts` | Проверки языков, жестов, краёв tooltip, Нигера, production debug и SEO-разметки |
| `lib/visualizer/README.md`, этот отчёт, `artifacts/level-0-polish/` | Актуальная документация и снимки |

Другие изменения в рабочем дереве относятся к предыдущим этапам; они сохранены.
Админский репозиторий не менялся.

## COUNTRY HOVER

Сохранено определение страны через реальную Earth surface → geographic frame
→ lat/lon → bbox filtering → hole-aware point-in-polygon. Индекс и геометрия
не зависят от языка; постоянный render loop не выполняет country detection.

Заливка hover — 0.16, selected — 0.23. Контуры соответственно 0.9 / 1.0.
Спутниковая текстура видна под прозрачным слоем. Depth testing, spherical
geometry, bounded cache и disposal сохранены.

Tooltip теперь имеет отдельные название и подсказку в едином стиле с панелью.
Ширина ограничена сценой, длинный текст переносится. Размеры HTML измеряются;
у верхнего края tooltip раскрывается вниз, у правого — переносится влево.
Позиция ограничена отступом 8 px. Текст не переписывается на каждом кадре.

В браузере tooltip Russia у самого верхнего края canvas раскрылся вниз:
canvas top=150, tooltip top=175, bottom=236.24 — целиком внутри сцены.

## SELECTION

Единый ключ — код страны. При выборе сохраняются highlight и HTML-панель.
Выбор другой страны не перезагружает GLB. Действия будущих разделов остаются
disabled; исторические сведения и счётчики не выдуманы.

Порог drag — 6 CSS px. Во время нажатия и вращения курсор остаётся grabbing.
Secondary click не выбирает страну. Pinch подавляет selection до отпускания
всех указателей; после этого снова работают мышиный hover и следующий tap.
Океан/пустая сцена — grab, selectable country — pointer.

Borders OFF скрывает общий слой, сохраняя selected/hover. Reset очищает
выбор и возвращает обзор без перезагрузки модели.

## FLY-TO

Сохранён существующий переход около 1000 ms с ease-in-out по сферической дуге.
Центр — representative point страны; framing использует её angular extent,
FOV и текущие min/max OrbitControls. Maximum zoom не увеличен. GLB/текстуры
не заменялись. Reduced motion и отмена pointer/wheel сохранены.

## I18N

Вся панель, названия, столицы, континенты, tooltip и кнопки используют существующий
useI18n и локализованные записи uk/ru/en. Английский empty state приведён к
`Select a country on the globe`. На смену locale вызывается refreshTooltip:
меняются текст и его размещение, а не selection, camera или GPU-геометрия.

Автоматические проверки прошли для UA, PL, IT, FR, NE, EG, IL, SA, IN на трёх
языках. Отдельно проверены столица/континент Украины, Reset/Borders/Fullscreen.
Тест controller сравнивает положение камеры и тот же GPU-слой после смены
языка, а также обновление неподвижного tooltip.

В реальном Chrome проверены переключения uk → en → ru → uk с выбранной
Украиной и Нигером. ISO selection и положение страны сохранились.
Исправлено исчезавшее выделение активной языковой кнопки: удалён конфликт
между прозрачным фоном и золотым фоном активного состояния; добавлен aria-pressed.

При браузерной проверке воспроизведено прежнее предупреждение React о `hreflang`.
В development теперь используется hrefLang; production SSR сохраняет прежний
lowercase-атрибут, необходимый существующим SEO-проверкам. Все alternate URLs
и x-default сохранены и проверены для обоих режимов. Повторное переключение
языка прошло без Next.js issues overlay.

## DEBUG

Geographic Calibration Debug, FPS и служебные координаты по-прежнему выводятся
только при NODE_ENV=development. Тест production render tree подтверждает
отсутствие надписи и обоих output-блоков. Снимки сделаны на dev-странице,
поэтому на них есть диагностический блок.

## MOBILE / TABLET

Проверены Chrome viewport 390×844 и 1024×768. Country tap/click открывает
существующий bottom sheet. Убрана дублирующая кнопка закрытия внутри него.
На 390×844 sheet имеет x=0…390, нижний край y=844; высота страницы = 844.
Закрытие, Reset и drag без выбора проверены на реальной странице.

На планшете исправлен двойной translate существующего выдвижного меню:
теперь его rect x=0…300, y=0…768. Второстепенный подзаголовок убран из
компактной шапки, чтобы не обрезаться. Временный viewport override сброшен.
Touch/pinch и последующий mouse hover проверены PointerEvent-тестами;
физический телефон/реальный двухпальцевый жест не использовались.

## PERFORMANCE

На этом Mac, Chrome, локальная HQ-сцена:

- 60 FPS в спокойном состоянии; во время параллельной сборки были просадки.
- 4 draw calls — обычный глобус.
- 7 — выбранная/hovered страна.
- 10 — selected плюс другая hovered страна.
- 6 — selected при выключенных общих границах.
- В наблюдениях этого этапа PIP занимал 0.1–1.2 ms.

Результаты локальные; это не измерение на физическом мобильном устройстве.
Hover ограничен 40 Hz, геометрия не пересоздаётся при смене текста/языка.

Браузерная проверка воды после вращения/приближения:

| Вода | Raycast lat/lon | Hover |
|---|---|---|
| Атлантика | −4.9167, −24.1105 | нет |
| Чёрное море | 42.3162, 38.5253 | нет |
| Каспийское море | 40.9572, 50.4011 | нет |
| Средиземное море (Ионическое) | 37.8700, 19.1134 | нет |

Niger проверен отдельно: 17.4660, 9.4628 → NE, локализованное название и Ниамей.

## TESTS

- `npm run typecheck` — PASS.
- `npm test` — **1005 passed, 97 files** после последней input-правки.
- `npm run build` — PASS, Next.js production и OpenNext worker.
- ESLint по изменённым файлам — 0 errors; прежнее предупреждение dependency
  setLocale в LanguageProvider, навигационная логика которого не менялась.
- `git diff --check` — PASS.
- Сборка сохраняет прежние неблокирующие предупреждения middleware→proxy и
  duplicate options в стороннем сгенерированном bundle.

Скриншоты:

1. [Default globe](artifacts/level-0-polish/default-globe.png)
2. [Hover country](artifacts/level-0-polish/hover-country.png)
3. [Selected country — UK](artifacts/level-0-polish/selected-country-uk.png)
4. [Selected country — EN](artifacts/level-0-polish/selected-country-en.png)
5. [Mobile selected country](artifacts/level-0-polish/mobile-selected.png)
