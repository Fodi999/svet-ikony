import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGospelReadingSource, prepareGospelReading, prepareGospelReadingForCalendarDay } from './gospel-reading-preparation';

const getCalendarDayMock = vi.fn();
vi.mock('@/lib/d1/repositories/calendarDays', () => ({ getCalendarDay: (id: string) => getCalendarDayMock(id) }));

const createGospelMock = vi.fn();
vi.mock('@/lib/d1/repositories/gospel', () => ({ createGospel: (payload: unknown) => createGospelMock(payload) }));

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });

/** Trimmed from a real fetch of https://www.oca.org/readings/daily/2026/09/15
 * (an ordinary weekday) -- includes the same unrelated navigation/search-
 * form links the real page carries around the actual reading list, so the
 * parser is proven to ignore them, not just to work on an idealized fixture. */
const ORDINARY_DAY_PAGE = `
<html><body>
<p class="breadcrumbs"><a href="/">Home</a> / <a href="/orthodoxy">The Orthodox Faith</a> /</p>
<h1>Scripture Readings</h1>
<h2><!-- debug "empty needle" message: array(1) { [0]=> string(0) "" } --> Tuesday, September 15, 2026</h2>
<section>
	<ul>
			<li><a href="/readings/daily/2026/09/15/1">Galatians 5:11-21</a></li>
			<li><a href="/readings/daily/2026/09/15/2">Mark 7:5-16</a></li>
		</ul>
</section>
<h3>Today&rsquo;s commemorated feasts and saints</h3>
<p><strong>Afterfeast of the Elevation of the Cross</strong>.</p>
<section>
	<h2>Search for a reading by date</h2>
	<form action="/actions/reading_date.php" method="get"></form>
</section>
</body></html>
`;

/** Trimmed from a real fetch of https://www.oca.org/readings/daily/2026/09/14
 * (a major feast -- the Elevation of the Cross -- with several liturgies'
 * worth of readings, including two Gospel citations). */
const FEAST_DAY_PAGE = `
<html><body>
<section>
	<ul>
			<li><a href="/readings/daily/2026/09/14/1">Exodus 15:22-16:1</a></li>
			<li><a href="/readings/daily/2026/09/14/2">Proverbs 3:11-18</a></li>
			<li><a href="/readings/daily/2026/09/14/3">Isaiah 60:11-16</a></li>
			<li><a href="/readings/daily/2026/09/14/4">John 12:28-36</a></li>
			<li><a href="/readings/daily/2026/09/14/5">Galatians 4:28-5:10</a></li>
			<li><a href="/readings/daily/2026/09/14/6">Mark 6:54-7:8</a></li>
			<li><a href="/readings/daily/2026/09/14/7">1 Corinthians 1:18-24</a></li>
			<li><a href="/readings/daily/2026/09/14/8">John 19:6-11, 13-20, 25-28, 30-35</a></li>
		</ul>
</section>
</body></html>
`;

function htmlResponse(body: string) {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

describe('parseGospelReadingSource', () => {
  it('extracts exactly the reading citations, ignoring surrounding navigation/search-form links', () => {
    expect(parseGospelReadingSource(ORDINARY_DAY_PAGE)).toEqual(['Galatians 5:11-21', 'Mark 7:5-16']);
  });
  it('extracts every citation on a major feast day with several readings', () => {
    expect(parseGospelReadingSource(FEAST_DAY_PAGE)).toEqual([
      'Exodus 15:22-16:1', 'Proverbs 3:11-18', 'Isaiah 60:11-16', 'John 12:28-36',
      'Galatians 4:28-5:10', 'Mark 6:54-7:8', '1 Corinthians 1:18-24', 'John 19:6-11, 13-20, 25-28, 30-35',
    ]);
  });
  it('returns an empty list, not a crash, for a page with no matching section', () => {
    expect(parseGospelReadingSource('<html><body>not a readings page</body></html>')).toEqual([]);
  });
});

describe('prepareGospelReading', () => {
  it('picks the single Gospel citation on an ordinary day, translating only the book name', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    const result = await prepareGospelReading('2026-09-15', 'uk');
    expect(result.reference).toBe('Мк. 7:5-16');
    expect(result.title).toBe('Євангельське читання: Мк. 7:5-16');
    expect(result.sourceUrl).toBe('https://www.oca.org/readings/daily/2026/09/15');
  });

  it('never picks a non-Gospel citation (Epistle/Old Testament) as the reading', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    const result = await prepareGospelReading('2026-09-15', 'uk');
    expect(result.reference).not.toContain('Galatians');
    expect(result.reference).not.toContain('5:11-21');
  });

  it('leaves text and explanation empty rather than reproducing scripture text', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    const result = await prepareGospelReading('2026-09-15', 'uk');
    expect(result.text).toBe('');
    expect(result.explanation).toBe('');
  });

  it('translates the book abbreviation per language, keeping chapter:verse verbatim', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    expect((await prepareGospelReading('2026-09-15', 'uk')).reference).toBe('Мк. 7:5-16');
    expect((await prepareGospelReading('2026-09-15', 'ru')).reference).toBe('Мк. 7:5-16');
    expect((await prepareGospelReading('2026-09-15', 'en')).reference).toBe('Mark 7:5-16');
  });

  it('takes the first Gospel citation on a multi-reading feast day', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(FEAST_DAY_PAGE));
    const result = await prepareGospelReading('2026-09-14', 'en');
    expect(result.reference).toBe('John 12:28-36');
  });

  it('fails closed with a review-needed error when the source has no Gospel citation at all', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<html><body><section><ul><li><a href="/readings/daily/2026/01/01/1">Genesis 1:1-5</a></li></ul></section></body></html>'));
    await expect(prepareGospelReading('2026-01-01', 'uk')).rejects.toMatchObject({ details: expect.stringContaining('Не вдалося визначити') });
  });

  it('fails closed when the source page is unreachable, without inventing a reading', async () => {
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(prepareGospelReading('2026-09-15', 'uk')).rejects.toMatchObject({ status: 502 });
  });

  it('fails closed when the response is not HTML', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    await expect(prepareGospelReading('2026-09-15', 'uk')).rejects.toMatchObject({ status: 502 });
  });
});

describe('prepareGospelReadingForCalendarDay', () => {
  beforeEach(() => {
    getCalendarDayMock.mockReset().mockResolvedValue({ id: 'day-1', dateNewStyle: '2026-09-15', dateOldStyle: null, language: 'uk' });
    createGospelMock.mockReset().mockImplementation(async (payload) => ({ id: 'gospel-new', ...payload }));
  });

  it('creates a new DRAFT Gospel reading pre-linked to the calendar day, never touching the day itself', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    await prepareGospelReadingForCalendarDay('day-1');
    expect(createGospelMock).toHaveBeenCalledWith(
      expect.objectContaining({ calendarDayId: 'day-1', language: 'uk', status: 'draft', reference: 'Мк. 7:5-16' }),
    );
  });

  it('uses the Julian date when there is no civil date on the calendar day', async () => {
    getCalendarDayMock.mockResolvedValue({ id: 'day-1', dateNewStyle: null, dateOldStyle: '2026-09-15', language: 'en' });
    fetchMock.mockResolvedValueOnce(htmlResponse(ORDINARY_DAY_PAGE));
    await prepareGospelReadingForCalendarDay('day-1');
    expect(fetchMock).toHaveBeenCalledWith('https://www.oca.org/readings/daily/2026/09/15', expect.anything());
  });

  it('rejects a calendar day with no date at all before ever fetching anything', async () => {
    getCalendarDayMock.mockResolvedValue({ id: 'day-1', dateNewStyle: null, dateOldStyle: null, language: 'uk' });
    await expect(prepareGospelReadingForCalendarDay('day-1')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
