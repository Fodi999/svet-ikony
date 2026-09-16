import { generateIconContent } from '@/lib/ai/icon-content';
import { checkContentLanguage } from '@/lib/ai/language-guard';
import { ApiError } from '@/lib/d1/errors';
import { getIcon, listIcons, updateIcon, type ChurchIconDto } from '@/lib/d1/repositories/icons';
import { getOpenAiConfig } from '@/lib/telegram/env';

/**
 * AI preparation actions for the Icon editor -- deliberately parallel to
 * lib/church/calendar-ai-actions.ts (same write-routing rule, same
 * language-safety gate, same "never overwrite existing content" rule for
 * the plain generate* actions), but WITHOUT that module's saint-of-day
 * verification gate: a calendar day's factual claim ("today is the feast
 * of X") is checked against an external canonical source (OCA/Wikipedia)
 * because the site is asserting a fact about the church calendar itself.
 * An icon carries no such external claim to verify -- it's a product page
 * for an object the admin already possesses and has already described
 * (title/saintName/feastName), so generation here only ever elaborates on
 * facts the admin has ALREADY typed in, never a claim sourced elsewhere.
 * Every action:
 *  - never invents which saint/feast the icon depicts -- that's the
 *    admin's own title/saintName/feastName, read but never altered;
 *  - never overwrites a field that already has content (use the paired
 *    regenerate* action for that);
 *  - never generates materials/dimensions -- those are physical facts
 *    about a specific object, not descriptive copy an AI can safely infer;
 *  - saves as DRAFT only when the icon is a draft; a PUBLISHED icon is
 *    never auto-mutated, same policy as calendar days.
 */

export type IconAiActionContext = { request: Request; adminUserId: string };
export type IconAiActionResult =
  | { mode: 'direct'; icon: ChurchIconDto }
  | { mode: 'proposal'; icon: ChurchIconDto; proposalId: string };

function assertAutomaticEditAllowed(icon: ChurchIconDto): void {
  if (icon.status !== 'draft' && icon.status !== 'published')
    throw ApiError.authorization(`Automatic edits are refused for status "${icon.status}"; this record requires human review`);
}

/** Same write-routing rule as calendar-ai-actions.ts's writeOrPropose():
 * draft writes directly, published becomes a human-authored proposal, any
 * other status is refused outright. */
async function writeOrPropose(
  icon: ChurchIconDto,
  patch: Record<string, unknown>,
  context: IconAiActionContext,
  reason: string
): Promise<IconAiActionResult> {
  if (icon.status === 'draft') return { mode: 'direct', icon: await updateIcon(icon.id, patch) };
  if (icon.status === 'published') {
    // Deferred import, same reasoning as calendar-ai-actions.ts: only a
    // PUBLISHED icon's actions ever need the ai-access module graph.
    const { createHumanAuthoredProposal } = await import('@/lib/ai-access/proposals');
    const proposal = await createHumanAuthoredProposal(context.request, context.adminUserId, 'icons', icon.id, patch, reason);
    return { mode: 'proposal', icon, proposalId: proposal.id };
  }
  throw ApiError.authorization(`Automatic edits are refused for status "${icon.status}"; this record requires human review`);
}

/**
 * A freshly-created translation sibling (task: "мова генерації для UK/RU/EN
 * -- як зараз працює для Церковного календаря") starts with none of its own
 * facts filled in yet -- only `title`/`slug`/`language` are set by
 * createTranslation. Rather than fall through to the bare-title case for
 * every field on every new language, this borrows the SAME icon's facts
 * from whichever sibling in its translation group already has them (the
 * language the admin originally described the icon in), so generating e.g.
 * the RU description of a UK-authored icon has real facts to translate/
 * elaborate on instead of just the title. Never crosses translation
 * groups -- only ever looks at siblings sharing this exact icon's own
 * `translationGroupId`.
 */
async function loadPrimarySiblingFacts(icon: ChurchIconDto): Promise<ChurchIconDto | null> {
  if (icon.saintName || icon.description || icon.history || icon.saintImageDescription) return null;
  const siblings = await listIcons({});
  const group = siblings.filter((sibling) => sibling.translationGroupId === icon.translationGroupId && sibling.id !== icon.id);
  return group.find((sibling) => sibling.saintName || sibling.description) ?? null;
}

function buildFacts(icon: ChurchIconDto, primary: ChurchIconDto | null): string {
  const source = primary ?? icon;
  const parts: string[] = [];
  if (source.saintName) parts.push(`Святий/сюжет: ${source.saintName}`);
  if (source.feastName) parts.push(`Свято: ${source.feastName}`);
  if (source.description) parts.push(`Наявний опис (${primary ? `мовою ${primary.language}, перекласти/адаптувати` : 'цією мовою'}): ${source.description}`);
  if (source.history) parts.push(`Наявна історична довідка${primary ? ` (мовою ${primary.language})` : ''}: ${source.history}`);
  if (source.saintImageDescription) parts.push(`Наявний опис зображення${primary ? ` (мовою ${primary.language})` : ''}: ${source.saintImageDescription}`);
  if (parts.length === 0) parts.push(`Назва ікони: ${icon.title}`);
  return parts.join('\n\n');
}

async function requireOpenAi() {
  const config = await getOpenAiConfig();
  if (!config) throw ApiError.validation('OpenAI is not configured');
  return config;
}

function contentLanguage(icon: ChurchIconDto): 'uk' | 'ru' | 'en' {
  if (icon.language === 'uk' || icon.language === 'ru' || icon.language === 'en') return icon.language;
  throw ApiError.validation('Unsupported content language');
}
function assertContentLanguage(text: string, icon: ChurchIconDto): void {
  if (!checkContentLanguage(text, contentLanguage(icon), icon.title).ok)
    throw ApiError.validation('Виявлено текст іншою мовою (LANGUAGE_MISMATCH)');
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

async function computeDescription(icon: ChurchIconDto, primary: ChurchIconDto | null, openAi: { apiKey: string; model?: string }): Promise<string> {
  const description = await generateIconContent({
    apiKey: openAi.apiKey,
    model: openAi.model,
    language: contentLanguage(icon),
    kind: 'description',
    title: icon.title,
    facts: buildFacts(icon, primary),
  });
  assertContentLanguage(description, icon);
  return description;
}

export async function generateIconDescription(iconId: string, context: IconAiActionContext): Promise<IconAiActionResult> {
  const icon = await getIcon(iconId);
  if (icon.description.trim()) throw ApiError.conflict('this icon already has a description -- use regenerate to replace it');
  return regenerateIconDescription(iconId, context);
}

export async function regenerateIconDescription(iconId: string, context: IconAiActionContext): Promise<IconAiActionResult> {
  const icon = await getIcon(iconId);
  assertAutomaticEditAllowed(icon);
  const openAi = await requireOpenAi();
  const primary = await loadPrimarySiblingFacts(icon);
  const description = await computeDescription(icon, primary, openAi);
  return writeOrPropose(icon, { description }, context, "Regenerate: опис ікони (потребує розгляду адміністратора)");
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

async function computeHistory(icon: ChurchIconDto, primary: ChurchIconDto | null, openAi: { apiKey: string; model?: string }): Promise<string> {
  const history = await generateIconContent({
    apiKey: openAi.apiKey,
    model: openAi.model,
    language: contentLanguage(icon),
    kind: 'history',
    title: icon.title,
    facts: buildFacts(icon, primary),
  });
  assertContentLanguage(history, icon);
  return history;
}

export async function generateIconHistory(iconId: string, context: IconAiActionContext): Promise<IconAiActionResult> {
  const icon = await getIcon(iconId);
  if (icon.history?.trim()) throw ApiError.conflict('this icon already has history text -- use regenerate to replace it');
  return regenerateIconHistory(iconId, context);
}

export async function regenerateIconHistory(iconId: string, context: IconAiActionContext): Promise<IconAiActionResult> {
  const icon = await getIcon(iconId);
  assertAutomaticEditAllowed(icon);
  const openAi = await requireOpenAi();
  const primary = await loadPrimarySiblingFacts(icon);
  const history = await computeHistory(icon, primary, openAi);
  return writeOrPropose(icon, { history }, context, "Regenerate: історична довідка ікони (потребує розгляду адміністратора)");
}

// ---------------------------------------------------------------------------
// Saint-image description
// ---------------------------------------------------------------------------

async function computeSaintImageDescription(icon: ChurchIconDto, primary: ChurchIconDto | null, openAi: { apiKey: string; model?: string }): Promise<string> {
  const saintImageDescription = await generateIconContent({
    apiKey: openAi.apiKey,
    model: openAi.model,
    language: contentLanguage(icon),
    kind: 'saint_image_description',
    title: icon.title,
    facts: buildFacts(icon, primary),
  });
  assertContentLanguage(saintImageDescription, icon);
  return saintImageDescription;
}

export async function generateIconSaintImageDescription(iconId: string, context: IconAiActionContext): Promise<IconAiActionResult> {
  const icon = await getIcon(iconId);
  if (icon.saintImageDescription?.trim()) throw ApiError.conflict('this icon already has a saint-image description -- use regenerate to replace it');
  return regenerateIconSaintImageDescription(iconId, context);
}

export async function regenerateIconSaintImageDescription(iconId: string, context: IconAiActionContext): Promise<IconAiActionResult> {
  const icon = await getIcon(iconId);
  assertAutomaticEditAllowed(icon);
  const openAi = await requireOpenAi();
  const primary = await loadPrimarySiblingFacts(icon);
  const saintImageDescription = await computeSaintImageDescription(icon, primary, openAi);
  return writeOrPropose(icon, { saintImageDescription }, context, "Regenerate: опис образу святого (потребує розгляду адміністратора)");
}

// ---------------------------------------------------------------------------
// Fill missing -- fills whichever of description/history/saintImageDescription
// are still empty, in one call, never overwriting anything already filled.
// ---------------------------------------------------------------------------

export type FillMissingIconField = 'description' | 'history' | 'saintImageDescription';
export type FillMissingIconSkip = { field: FillMissingIconField; reason: 'failed' };
export type FillMissingIconResult =
  | { mode: 'direct'; icon: ChurchIconDto; filled: FillMissingIconField[]; skipped: FillMissingIconSkip[] }
  | { mode: 'proposal'; icon: ChurchIconDto; proposalId: string | null; proposedFields: FillMissingIconField[]; skipped: FillMissingIconSkip[] };

export async function fillMissingIconContent(iconId: string, context: IconAiActionContext): Promise<FillMissingIconResult> {
  const icon = await getIcon(iconId);
  assertAutomaticEditAllowed(icon);
  const openAi = await requireOpenAi();
  const primary = await loadPrimarySiblingFacts(icon);

  const patch: Record<string, unknown> = {};
  const filled: FillMissingIconField[] = [];
  const skipped: FillMissingIconSkip[] = [];

  if (!icon.description.trim()) {
    try { patch.description = await computeDescription(icon, primary, openAi); filled.push('description'); }
    catch { skipped.push({ field: 'description', reason: 'failed' }); }
  }
  if (!icon.history?.trim()) {
    try { patch.history = await computeHistory(icon, primary, openAi); filled.push('history'); }
    catch { skipped.push({ field: 'history', reason: 'failed' }); }
  }
  if (!icon.saintImageDescription?.trim()) {
    try { patch.saintImageDescription = await computeSaintImageDescription(icon, primary, openAi); filled.push('saintImageDescription'); }
    catch { skipped.push({ field: 'saintImageDescription', reason: 'failed' }); }
  }

  if (Object.keys(patch).length === 0) {
    return icon.status === 'draft'
      ? { mode: 'direct', icon, filled: [], skipped }
      : { mode: 'proposal', icon, proposalId: null, proposedFields: [], skipped };
  }

  const result = await writeOrPropose(icon, patch, context, 'Заповнити відсутнє з AI (потребує розгляду адміністратора)');
  return result.mode === 'direct'
    ? { mode: 'direct', icon: result.icon, filled, skipped }
    : { mode: 'proposal', icon: result.icon, proposalId: result.proposalId, proposedFields: filled, skipped };
}
