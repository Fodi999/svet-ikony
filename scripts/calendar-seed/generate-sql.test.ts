import { describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the translation_group_id gap found during the
 * MULTILINGUAL-3 release: this script's church_gospel_readings/
 * church_articles INSERTs omitted translation_group_id entirely. Unlike
 * church_saints (whose column got a real column-level DEFAULT from the
 * original CREATE TABLE, migrations/0001_svetikony_schema.sql, and is
 * safe to omit), church_gospel_readings/church_articles gained the
 * column via migration 0017's ALTER TABLE ADD COLUMN -- which cannot
 * carry a non-constant DEFAULT against a non-empty table (see that
 * migration's own comment) -- so the column has no default at all. Any
 * INSERT that omits it is left with a NULL group id.
 *
 * This script (scripts/calendar-seed/generate-sql.mjs) runs its entire
 * body at module-load time and writes the generated SQL to
 * process.stdout -- there's no exported function to call directly, so
 * this test captures that stdout write and inspects the real generated
 * SQL text, the same output a human would pipe to a file and run against
 * D1.
 *
 * Statement boundaries are found by matching through to each INSERT's own
 * "WHERE NOT EXISTS (...)" closing paren+semicolon, not the first bare
 * `;` -- several days' real reference/explanation text (e.g. multi-book
 * scripture citations like "Луки 10:38-42; Матвія 6:14") contain a
 * semicolon INSIDE a quoted value, which would truncate a naive
 * first-`;` match mid-statement.
 */
function extractStatements(sql: string, table: string): string[] {
  const pattern = new RegExp(`INSERT INTO ${table}[\\s\\S]*?WHERE NOT EXISTS \\([\\s\\S]*?\\)\\s*;`, 'g');
  return sql.match(pattern) ?? [];
}

async function generatedSql(): Promise<string> {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  vi.resetModules();
  // Imported purely for its side effect (writing SQL to stdout) -- no
  // exports are consumed, so the missing .mjs declaration is fine to
  // suppress here rather than adding an ambient module declaration.
  // @ts-expect-error -- generate-sql.mjs has no type declarations
  await import('./generate-sql.mjs');
  spy.mockRestore();
  return writes.join('');
}

describe('scripts/calendar-seed/generate-sql.mjs -- translation_group_id', () => {
  it('every church_gospel_readings INSERT declares and supplies a real translation_group_id', async () => {
    const sql = await generatedSql();
    const inserts = extractStatements(sql, 'church_gospel_readings');
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      expect(insert).toMatch(/\(id, calendar_day_id, slug, title, reference, text, explanation, language, status, translation_group_id\)/);
      expect(insert).toMatch(/'uk', 'published', '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/);
    }
  });

  it('every church_articles INSERT declares and supplies a real translation_group_id', async () => {
    const sql = await generatedSql();
    const inserts = extractStatements(sql, 'church_articles');
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      expect(insert).toMatch(/\(id, calendar_day_id, title, slug, content, language, status, translation_group_id\)/);
      expect(insert).toMatch(/'uk', 'published', '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/);
    }
  });

  it('church_saints INSERTs still correctly omit translation_group_id (its column has a real CREATE TABLE-level DEFAULT, unlike articles/gospel)', async () => {
    const sql = await generatedSql();
    const inserts = extractStatements(sql, 'church_saints');
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      expect(insert).not.toContain('translation_group_id');
    }
  });

  it('each gospel/article INSERT gets its own distinct group id, not one shared value', async () => {
    const sql = await generatedSql();
    const uuidOf = (insert: string) => insert.match(/'uk', 'published', '([0-9a-f-]{36})'/)?.[1];

    const gospelIds = extractStatements(sql, 'church_gospel_readings').map(uuidOf);
    expect(new Set(gospelIds).size).toBe(gospelIds.length);

    const articleIds = extractStatements(sql, 'church_articles').map(uuidOf);
    expect(new Set(articleIds).size).toBe(articleIds.length);
  });
});
