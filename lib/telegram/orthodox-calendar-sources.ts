/**
 * The two independent commemoration sources orthodox-calendar-verifier.ts
 * cross-checks against, split into their own module so tests can simulate
 * a source being temporarily unavailable (vi.mock this module) without
 * reaching into the verifier's internals. See that file's own comment for
 * why this is a curated, cited dataset rather than a live external
 * scrape -- the pipeline runs unattended every 5 minutes and must stay
 * deterministic and offline-testable.
 */

export type VerifiedCommemoration = {
  name: string;
  rank: string;
};

export type ReferenceSourceEntry = {
  source: string;
  commemorations: VerifiedCommemoration[];
};

/**
 * Keyed by old-style (Julian) 'MM-DD'.
 *
 * '08-18': verified 2026-08-31 against oca.org/saints/all-lives/2020/08/18
 * and orthodoxwiki.org/August_18 -- both independently list "Martyrs
 * Florus and Laurus of Illyria" for August 18 (their own site's fixed
 * Menaion day numbering), which an Old-Style/Julian-calendar church
 * celebrates 13 days later, on civil Gregorian August 31 -- see
 * julian-calendar.ts for the calendar policy this cross-references.
 *
 * '08-19': verified 2026-09-01 against oca.org/saints/all-lives/2020/08/19
 * and orthodoxwiki.org/August_19 -- both independently list "Martyr Andrew
 * Stratelates" (with his soldiers) for August 19, corresponding to civil
 * Gregorian September 1.
 *
 * '08-20' through '09-17': verified 2026-09-01 (30-day content population
 * task, civil 2026-09-01..2026-09-30) the same way, against
 * oca.org/saints/all-lives/2020/{MM}/{DD} and orthodoxwiki.org/{Month}_{Day}
 * -- see scripts/calendar-seed/data.mjs for the full research notes this
 * was built from. Two dates in that range are deliberately left OUT of
 * both tables below, because the two sources genuinely disagreed on the
 * day's primary commemoration:
 *   - '09-02': OCA headlines Venerable Anthony & Theodosius of the Kiev
 *     Caves; OrthodoxWiki headlines Martyr Mamas of Caesarea. No entry
 *     here for '09-02' -> verifySaintOfDay() fails closed with
 *     'no_reference_data' regardless of whatever candidate D1 offers.
 *   - '09-11': OCA and OrthodoxWiki disagree on both the day's headline
 *     saint AND that saint's rank (Venerable vs Martyr) for "Theodora of
 *     Alexandria". No entry here for '09-11' either, same fail-closed
 *     effect.
 */
const SOURCE_A_DATA: Record<string, ReferenceSourceEntry> = {
  '08-18': {
    source: 'OCA (oca.org/saints/all-lives/2020/08/18)',
    commemorations: [
      { name: 'Флор', rank: 'мученик' },
      { name: 'Лавр', rank: 'мученик' },
    ],
  },
  '08-19': {
    source: 'OCA (oca.org/saints/all-lives/2020/08/19)',
    commemorations: [{ name: 'Андрій Стратилат', rank: 'мученик' }],
  },
  '08-20': { source: 'OCA (oca.org/saints/all-lives/2020/08/20)', commemorations: [{ name: 'Самуїл', rank: 'пророк' }] },
  '08-21': { source: 'OCA (oca.org/saints/all-lives/2020/08/21)', commemorations: [{ name: 'Тадей', rank: 'апостол з 70-ти' }] },
  '08-22': { source: 'OCA (oca.org/saints/all-lives/2020/08/22)', commemorations: [{ name: 'Агафоник', rank: 'мученик' }] },
  '08-23': { source: 'OCA (oca.org/saints/all-lives/2020/08/23)', commemorations: [{ name: 'Іриней', rank: 'священномученик' }] },
  '08-24': { source: 'OCA (oca.org/saints/all-lives/2020/08/24)', commemorations: [{ name: 'Євтихій', rank: 'священномученик' }] },
  '08-25': { source: 'OCA (oca.org/saints/all-lives/2020/08/25)', commemorations: [{ name: 'Тит', rank: 'апостол з 70-ти' }] },
  '08-26': {
    source: 'OCA (oca.org/saints/all-lives/2020/08/26)',
    commemorations: [
      { name: 'Адріан', rank: 'мученик' },
      { name: 'Наталія', rank: 'мучениця' },
    ],
  },
  '08-27': { source: 'OCA (oca.org/saints/all-lives/2020/08/27)', commemorations: [{ name: 'Пимен', rank: 'преподобний' }] },
  '08-28': { source: 'OCA (oca.org/saints/all-lives/2020/08/28)', commemorations: [{ name: 'Мойсей Мурин', rank: 'преподобний' }] },
  '08-29': {
    source: 'OCA (oca.org/saints/all-lives/2020/08/29)',
    commemorations: [{ name: 'Хреститель', rank: 'пророк, Предтеча і Хреститель Господній' }],
  },
  '08-30': {
    source: 'OCA (oca.org/saints/all-lives/2020/08/30)',
    commemorations: [
      { name: 'Олександр', rank: 'святитель' },
      { name: 'Іоан Постник', rank: 'святитель' },
      { name: 'Павло Новий', rank: 'святитель' },
    ],
  },
  '08-31': {
    source: 'OCA (oca.org/saints/all-lives/2020/08/31)',
    commemorations: [{ name: 'пояса Пресвятої Богородиці', rank: 'свято' }],
  },
  '09-01': { source: 'OCA (oca.org/saints/all-lives/2020/09/01)', commemorations: [{ name: 'Симеон', rank: 'преподобний Стовпник' }] },
  '09-03': { source: 'OCA (oca.org/saints/all-lives/2020/09/03)', commemorations: [{ name: 'Анфим', rank: 'священномученик' }] },
  '09-04': { source: 'OCA (oca.org/saints/all-lives/2020/09/04)', commemorations: [{ name: 'Мойсей Боговидець', rank: 'пророк' }] },
  '09-05': {
    source: 'OCA (oca.org/saints/all-lives/2020/09/05)',
    commemorations: [
      { name: 'Захарія', rank: 'пророк' },
      { name: 'Єлисавета', rank: 'праведна' },
    ],
  },
  '09-06': { source: 'OCA (oca.org/saints/all-lives/2020/09/06)', commemorations: [{ name: 'Архістратига Михаїла', rank: 'чудо в Хонех' }] },
  '09-07': { source: 'OCA (oca.org/saints/all-lives/2020/09/07)', commemorations: [{ name: 'Передсвято Різдва', rank: 'свято' }] },
  '09-08': { source: 'OCA (oca.org/saints/all-lives/2020/09/08)', commemorations: [{ name: 'Пресвятої Богородиці', rank: 'свято Різдва' }] },
  '09-09': {
    source: 'OCA (oca.org/saints/all-lives/2020/09/09)',
    commemorations: [
      { name: 'Йоаким', rank: 'богоотець' },
      { name: 'Анна', rank: 'богоотця' },
    ],
  },
  '09-10': {
    source: 'OCA (oca.org/saints/all-lives/2020/09/10)',
    commemorations: [
      { name: 'Менодора', rank: 'мучениця' },
      { name: 'Митродора', rank: 'мучениця' },
      { name: 'Нимфодора', rank: 'мучениця' },
    ],
  },
  '09-12': { source: 'OCA (oca.org/saints/all-lives/2020/09/12)', commemorations: [{ name: 'Автоном', rank: 'священномученик' }] },
  '09-13': { source: 'OCA (oca.org/saints/all-lives/2020/09/13)', commemorations: [{ name: 'Корнилій сотник', rank: 'священномученик' }] },
  '09-14': { source: 'OCA (oca.org/saints/all-lives/2020/09/14)', commemorations: [{ name: 'Воздвиження', rank: 'свято Хреста Господнього' }] },
  '09-15': { source: 'OCA (oca.org/saints/all-lives/2020/09/15)', commemorations: [{ name: 'Никита Готський', rank: 'великомученик' }] },
  '09-16': { source: 'OCA (oca.org/saints/all-lives/2020/09/16)', commemorations: [{ name: 'Євфимія', rank: 'велика мучениця' }] },
  '09-17': {
    source: 'OCA (oca.org/saints/all-lives/2020/09/17)',
    commemorations: [
      { name: 'Софія', rank: 'мучениця' },
      { name: 'Віра', rank: 'мучениця' },
      { name: 'Надія', rank: 'мучениця' },
      { name: 'Любов', rank: 'мучениця' },
    ],
  },
};

const SOURCE_B_DATA: Record<string, ReferenceSourceEntry> = {
  '08-18': {
    source: 'OrthodoxWiki (orthodoxwiki.org/August_18)',
    commemorations: [
      { name: 'Флор', rank: 'мученик' },
      { name: 'Лавр', rank: 'мученик' },
    ],
  },
  '08-19': {
    source: 'OrthodoxWiki (orthodoxwiki.org/August_19)',
    commemorations: [{ name: 'Андрій Стратилат', rank: 'мученик' }],
  },
  '08-20': { source: 'OrthodoxWiki (orthodoxwiki.org/August_20)', commemorations: [{ name: 'Самуїл', rank: 'пророк' }] },
  '08-21': { source: 'OrthodoxWiki (orthodoxwiki.org/August_21)', commemorations: [{ name: 'Тадей', rank: 'апостол з 70-ти' }] },
  '08-22': { source: 'OrthodoxWiki (orthodoxwiki.org/August_22)', commemorations: [{ name: 'Агафоник', rank: 'мученик' }] },
  '08-23': { source: 'OrthodoxWiki (orthodoxwiki.org/August_23)', commemorations: [{ name: 'Іриней', rank: 'священномученик' }] },
  '08-24': { source: 'OrthodoxWiki (orthodoxwiki.org/August_24)', commemorations: [{ name: 'Євтихій', rank: 'священномученик' }] },
  '08-25': { source: 'OrthodoxWiki (orthodoxwiki.org/August_25)', commemorations: [{ name: 'Тит', rank: 'апостол з 70-ти' }] },
  '08-26': {
    source: 'OrthodoxWiki (orthodoxwiki.org/August_26)',
    commemorations: [
      { name: 'Адріан', rank: 'мученик' },
      { name: 'Наталія', rank: 'мучениця' },
    ],
  },
  '08-27': { source: 'OrthodoxWiki (orthodoxwiki.org/August_27)', commemorations: [{ name: 'Пимен', rank: 'преподобний' }] },
  '08-28': { source: 'OrthodoxWiki (orthodoxwiki.org/August_28)', commemorations: [{ name: 'Мойсей Мурин', rank: 'преподобний' }] },
  '08-29': {
    source: 'OrthodoxWiki (orthodoxwiki.org/August_29)',
    commemorations: [{ name: 'Хреститель', rank: 'пророк, Предтеча і Хреститель Господній' }],
  },
  '08-30': {
    source: 'OrthodoxWiki (orthodoxwiki.org/August_30)',
    commemorations: [
      { name: 'Олександр', rank: 'святитель' },
      { name: 'Іоан Постник', rank: 'святитель' },
      { name: 'Павло Новий', rank: 'святитель' },
    ],
  },
  '08-31': {
    source: 'OrthodoxWiki (orthodoxwiki.org/August_31)',
    commemorations: [{ name: 'пояса Пресвятої Богородиці', rank: 'свято' }],
  },
  '09-01': { source: 'OrthodoxWiki (orthodoxwiki.org/September_1)', commemorations: [{ name: 'Симеон', rank: 'преподобний Стовпник' }] },
  '09-03': { source: 'OrthodoxWiki (orthodoxwiki.org/September_3)', commemorations: [{ name: 'Анфим', rank: 'священномученик' }] },
  '09-04': { source: 'OrthodoxWiki (orthodoxwiki.org/September_4)', commemorations: [{ name: 'Мойсей Боговидець', rank: 'пророк' }] },
  '09-05': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_5)',
    commemorations: [
      { name: 'Захарія', rank: 'пророк' },
      { name: 'Єлисавета', rank: 'праведна' },
    ],
  },
  '09-06': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_6)',
    commemorations: [{ name: 'Архістратига Михаїла', rank: 'чудо в Хонех' }],
  },
  '09-07': { source: 'OrthodoxWiki (orthodoxwiki.org/September_7)', commemorations: [{ name: 'Передсвято Різдва', rank: 'свято' }] },
  '09-08': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_8)',
    commemorations: [{ name: 'Пресвятої Богородиці', rank: 'свято Різдва' }],
  },
  '09-09': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_9)',
    commemorations: [
      { name: 'Йоаким', rank: 'богоотець' },
      { name: 'Анна', rank: 'богоотця' },
    ],
  },
  '09-10': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_10)',
    commemorations: [
      { name: 'Менодора', rank: 'мучениця' },
      { name: 'Митродора', rank: 'мучениця' },
      { name: 'Нимфодора', rank: 'мучениця' },
    ],
  },
  '09-12': { source: 'OrthodoxWiki (orthodoxwiki.org/September_12)', commemorations: [{ name: 'Автоном', rank: 'священномученик' }] },
  '09-13': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_13)',
    commemorations: [{ name: 'Корнилій сотник', rank: 'священномученик' }],
  },
  '09-14': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_14)',
    commemorations: [{ name: 'Воздвиження', rank: 'свято Хреста Господнього' }],
  },
  '09-15': { source: 'OrthodoxWiki (orthodoxwiki.org/September_15)', commemorations: [{ name: 'Никита Готський', rank: 'великомученик' }] },
  '09-16': { source: 'OrthodoxWiki (orthodoxwiki.org/September_16)', commemorations: [{ name: 'Євфимія', rank: 'велика мучениця' }] },
  '09-17': {
    source: 'OrthodoxWiki (orthodoxwiki.org/September_17)',
    commemorations: [
      { name: 'Софія', rank: 'мучениця' },
      { name: 'Віра', rank: 'мучениця' },
      { name: 'Надія', rank: 'мучениця' },
      { name: 'Любов', rank: 'мучениця' },
    ],
  },
};

export async function lookupSourceA(oldStyleMonthDay: string): Promise<ReferenceSourceEntry | null> {
  return SOURCE_A_DATA[oldStyleMonthDay] ?? null;
}

export async function lookupSourceB(oldStyleMonthDay: string): Promise<ReferenceSourceEntry | null> {
  return SOURCE_B_DATA[oldStyleMonthDay] ?? null;
}
