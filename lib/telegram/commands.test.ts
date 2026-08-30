import { describe, expect, it } from 'vitest';
import { commandFromCallbackData, parseSlashCommand } from './commands';

/** Mirrors assistant/src/interfaces/telegram/commands.rs's test suite —
 * same cases, same expectations, so both bot implementations parse
 * identically. */

describe('parseSlashCommand', () => {
  it('parses a plain /start', () => {
    expect(parseSlashCommand('/start')).toBe('start');
  });

  it('parses /start with a bot-name suffix (Telegram group chats)', () => {
    expect(parseSlashCommand('/start@SvitloIkonyBot')).toBe('start');
  });

  it('parses a command with trailing args', () => {
    expect(parseSlashCommand('/today please')).toBe('today');
  });

  it('is case-insensitive', () => {
    expect(parseSlashCommand('/START')).toBe('start');
  });

  it('trims surrounding whitespace', () => {
    expect(parseSlashCommand('  /help  ')).toBe('help');
  });

  it('parses every required command', () => {
    expect(parseSlashCommand('/today')).toBe('today');
    expect(parseSlashCommand('/prayer')).toBe('prayer');
    expect(parseSlashCommand('/saint')).toBe('saint');
    expect(parseSlashCommand('/gospel')).toBe('gospel');
    expect(parseSlashCommand('/help')).toBe('help');
  });

  it('rejects free text', () => {
    expect(parseSlashCommand('Слава Ісусу Христу')).toBeNull();
    expect(parseSlashCommand('')).toBeNull();
  });

  it('rejects an unknown slash command', () => {
    expect(parseSlashCommand('/unknown')).toBeNull();
  });
});

describe('commandFromCallbackData', () => {
  it('maps to the same commands as the slash-text parser', () => {
    expect(commandFromCallbackData('today')).toBe('today');
    expect(commandFromCallbackData('prayer')).toBe('prayer');
    expect(commandFromCallbackData('saint')).toBe('saint');
    expect(commandFromCallbackData('gospel')).toBe('gospel');
  });

  it('does not resolve the settings stub or unknown data as a command', () => {
    expect(commandFromCallbackData('settings')).toBeNull();
    expect(commandFromCallbackData('bogus')).toBeNull();
  });
});
