import type { InlineKeyboardMarkup } from './client';

/** Mirrors assistant/src/interfaces/telegram/keyboards.rs — same layout,
 * same callback_data values, so both bot implementations route identically. */
export function mainMenuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '☦️ Сьогодні', callback_data: 'today' }],
      [
        { text: '🙏 Молитва', callback_data: 'prayer' },
        { text: '📖 Євангеліє', callback_data: 'gospel' },
      ],
      [{ text: '🕯 Святий дня', callback_data: 'saint' }],
      [{ text: '⚙️ Налаштування', callback_data: 'settings' }],
    ],
  };
}
