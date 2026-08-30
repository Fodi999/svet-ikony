import type { PublicChurchContentPage } from '@/lib/church-public/calendar-page';
import type { ChurchGospelDto } from '@/lib/d1/repositories/gospel';
import type { ChurchPrayerDto } from '@/lib/d1/repositories/prayers';
import type { ChurchSaintDto } from '@/lib/d1/repositories/saints';

/** Command parsing and pure text templates — mirrors
 * assistant/src/interfaces/telegram/commands.rs exactly (same command set,
 * same Ukrainian copy) so the bot behaves identically regardless of which
 * backend's webhook Telegram is currently pointed at. Nothing here touches
 * D1 or the network, which keeps it trivially unit-testable. */

export type Command = 'start' | 'today' | 'prayer' | 'saint' | 'gospel' | 'help';

const COMMAND_NAMES = new Set<Command>(['start', 'today', 'prayer', 'saint', 'gospel', 'help']);

/** Parses a Telegram message's `text` as a bot command. Handles the two
 * things real Telegram clients actually send that a naive string match
 * would miss:
 * - `/start@SvitloIkonyBot` (Telegram appends `@BotName` in group chats)
 * - `/today some trailing args` (only the first whitespace-separated token
 *   is the command) */
export function parseSlashCommand(text: string): Command | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  const firstToken = trimmed.split(/\s+/)[0];
  const name = firstToken.slice(1).split('@')[0].toLowerCase();

  return COMMAND_NAMES.has(name as Command) ? (name as Command) : null;
}

/** Maps an inline-keyboard button's `callback_data` (see keyboards.ts) back
 * to the same Command a slash-command twin would produce. */
export function commandFromCallbackData(data: string): Command | null {
  return COMMAND_NAMES.has(data as Command) ? (data as Command) : null;
}

export const START_TEXT = `☦️ Вітаємо у «Світло Ікони»

Я допоможу вам щодня бути поруч із православною традицією:
🙏 молитви
📖 Євангеліє
☦️ церковний календар
🕯 святі дня
📚 духовні історії`;

export const HELP_TEXT = `Доступні команди:
/today — церковний календар на сьогодні
/prayer — молитва
/saint — святий дня
/gospel — уривок з Євангелія
/help — ця підказка`;

export const SETTINGS_STUB_TEXT = "⚙️ Налаштування скоро з'являться.";

export const NO_CONTENT_TODAY_TEXT =
  'На сьогодні ще немає опублікованого запису церковного календаря. Спробуйте пізніше 🙏';
export const NO_PRAYER_TEXT = 'Молитви ще не додані. Спробуйте пізніше 🙏';
export const NO_SAINT_TEXT = 'Інформацію про святого дня ще не додано. Спробуйте пізніше 🕯';
export const NO_GOSPEL_TEXT = 'Уривок з Євангелія ще не додано. Спробуйте пізніше 📖';

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Formats the `/today` summary: calendar day title/description plus a
 * one-line teaser for the saint, prayer and gospel reading of the day (when
 * present), matching format_today in the Rust commands.rs. */
export function formatToday(page: PublicChurchContentPage, saints: ChurchSaintDto[]): string {
  let text = `☦️ ${page.calendarDay.title}`;

  const description = nonEmpty(page.calendarDay.description);
  if (description) text += `\n${description}`;

  if (saints[0]) text += `\n\n🕯 Святий дня: ${saints[0].name}`;
  if (page.prayers[0]) text += `\n🙏 Молитва: ${page.prayers[0].title}`;
  if (page.gospel[0]) text += `\n📖 Євангеліє: ${page.gospel[0].title} (${page.gospel[0].reference})`;

  text += '\n\nОберіть розділ нижче, щоб дізнатися більше 👇';
  return text;
}

export function formatPrayer(prayer: ChurchPrayerDto): string {
  return `🙏 ${prayer.title}\n\n${prayer.text}`;
}

export function formatSaint(saint: ChurchSaintDto): string {
  let text = `🕯 ${saint.name}`;
  const feastDay = nonEmpty(saint.feastDayNewStyle) ?? nonEmpty(saint.feastDayOldStyle);
  if (feastDay) text += `\nДень пам'яті: ${feastDay}`;
  const description = nonEmpty(saint.shortDescription);
  if (description) text += `\n\n${description}`;
  return text;
}

export function formatGospel(gospel: ChurchGospelDto): string {
  return `📖 ${gospel.title} (${gospel.reference})\n\n${gospel.text}`;
}
