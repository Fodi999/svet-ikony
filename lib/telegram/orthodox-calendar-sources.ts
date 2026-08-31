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
};

export async function lookupSourceA(oldStyleMonthDay: string): Promise<ReferenceSourceEntry | null> {
  return SOURCE_A_DATA[oldStyleMonthDay] ?? null;
}

export async function lookupSourceB(oldStyleMonthDay: string): Promise<ReferenceSourceEntry | null> {
  return SOURCE_B_DATA[oldStyleMonthDay] ?? null;
}
