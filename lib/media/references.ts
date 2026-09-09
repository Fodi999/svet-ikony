import { d1All, d1First } from '@/lib/d1/db';
import { getMediaBucket } from '@/lib/d1/env';
import { validateMediaKey } from './keys';

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Conservative reference check across existing entity text fields, including
 * URL/JSON media collections. A false positive keeps a file rather than losing it.
 * Schema identifiers come only from SQLite and are quoted, values are bound. */
export async function mediaIsReferenced(key: string): Promise<boolean> {
  const tables = await d1All<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
  for (const { name } of tables) {
    const columns = await d1All<{ name: string; type: string }>(`PRAGMA table_info(${quoted(name)})`);
    const text = columns.filter((column) => /TEXT|CHAR|CLOB/i.test(column.type));
    if (!text.length) continue;
    const match = await d1First(`SELECT 1 AS found FROM ${quoted(name)} WHERE ${text.map((column) => `instr(${quoted(column.name)}, ?1) > 0`).join(' OR ')} LIMIT 1`, key);
    if (match) return true;
  }
  return false;
}

export async function removeUnreferencedModelFile(key: string): Promise<void> {
  if (!validateMediaKey(key) || !key.startsWith('media/visualizer/') || !key.endsWith('.glb')) return;
  // If checking fails, never delete. Entity writes have already succeeded;
  // the file remains available for a later explicit media-library cleanup.
  try {
    if (!await mediaIsReferenced(key)) await (await getMediaBucket()).delete(key);
  } catch (error) { console.warn('Model file cleanup deferred', error); }
}
