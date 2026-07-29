export type ParsedRange = { offset: number; length: number };

/**
 * Parses a single `Range: bytes=start-end` header against a known object
 * size. Only single-range requests are supported (`bytes=0-99,200-299`
 * multi-range would need a multipart/byteranges response — a genuinely
 * bigger abstraction than this stage's brief allows for, so it's
 * deliberately out of scope: an unparseable or multi-range header is
 * treated the same as "no Range header", which is spec-legal — a server
 * may always ignore a Range it doesn't intend to honor and return the
 * whole entity with 200).
 *
 * Returns:
 *  - `null` if there's no Range header, or it can't be parsed as a single
 *    `bytes=` range (caller should serve the full object with 200).
 *  - `'unsatisfiable'` if the header parses but describes a range outside
 *    the object (caller should respond 416).
 *  - `{ offset, length }` for a valid, in-bounds range (caller should
 *    respond 206 with a matching Content-Range).
 */
export function parseRangeHeader(rangeHeader: string | null, size: number): ParsedRange | 'unsatisfiable' | null {
  if (!rangeHeader) return null;
  if (rangeHeader.includes(',')) return null; // multi-range: not supported, fall back to a full 200

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (!startStr && !endStr) return null;

  let start: number;
  let end: number;
  if (!startStr) {
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'unsatisfiable';
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr ? Number(endStr) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return 'unsatisfiable';
  }

  const clampedEnd = Math.min(end, size - 1);
  return { offset: start, length: clampedEnd - start + 1 };
}

export function contentRangeHeader(range: ParsedRange, size: number): string {
  return `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`;
}
