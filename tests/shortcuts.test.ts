// Keyboard shortcut model: combo parsing from DOM events, display
// formatting and default/conflict handling.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  comboFromEvent,
  comboToString,
  displayShortcut,
  eventKeyName,
  findShortcutConflict,
  matchesEvent,
  normalizeShortcut,
  shortcutChips,
} from '../src/shared/shortcuts';

function ev(key: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}, code?: string) {
  return {
    key,
    code,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    metaKey: mods.meta ?? false,
  };
}

describe('normalizeShortcut', () => {
  it('canonicalizes case, spacing and modifier order', () => {
    expect(normalizeShortcut('Ctrl+D')).toBe('ctrl+d');
    expect(normalizeShortcut('  L ')).toBe('l');
    expect(normalizeShortcut('SHIFT+CTRL+7')).toBe('ctrl+shift+7');
    expect(normalizeShortcut('Control + Alt + Delete')).toBe('ctrl+alt+delete');
    expect(normalizeShortcut('META+S')).toBe('meta+s');
  });

  it('maps aliases to canonical key names', () => {
    expect(normalizeShortcut('Escape')).toBe('esc');
    expect(normalizeShortcut('Space')).toBe('space');
    expect(normalizeShortcut('ArrowLeft')).toBe('left');
    expect(normalizeShortcut('F2')).toBe('f2');
    expect(normalizeShortcut('F24')).toBe('f24');
  });

  it('rejects invalid combos', () => {
    expect(normalizeShortcut('')).toBeNull();
    expect(normalizeShortcut('ctrl')).toBeNull(); // modifier-only
    expect(normalizeShortcut('Ctrl+Shift')).toBeNull();
    expect(normalizeShortcut('ctrl+ctrl+d')).toBeNull(); // unknown token (ctrl used as key)
    expect(normalizeShortcut('ctrl+F25')).toBeNull();
    expect(normalizeShortcut('ctrl+<')).toBeNull();
    expect(normalizeShortcut('ctrl+alt+shift+meta+f24+x')).toBeNull(); // too many parts
    expect(normalizeShortcut('cmd+x+d')).toBeNull();
    expect(normalizeShortcut(undefined as unknown as string)).toBeNull();
  });

  it('keeps DEFAULT_SHORTCUTS canonical and conflict-free', () => {
    for (const combo of Object.values(DEFAULT_SHORTCUTS)) {
      expect(normalizeShortcut(combo)).toBe(combo);
    }
    expect(findShortcutConflict(DEFAULT_SHORTCUTS)).toBeNull();
  });
});

describe('eventKeyName / comboFromEvent', () => {
  it('prefers the physical code for letters and digits', () => {
    expect(eventKeyName({ key: 'A', code: 'KeyA' })).toBe('a');
    expect(eventKeyName({ key: '&', code: 'Digit7' })).toBe('7');
    expect(comboFromEvent(ev('A', { shift: true }, 'KeyA'))).toBe('shift+a');
    expect(comboFromEvent(ev('&', { shift: true }, 'Digit7'))).toBe('shift+7');
  });

  it('maps special keys', () => {
    expect(comboFromEvent(ev(' '))).toBe('space');
    expect(comboFromEvent(ev('Escape'))).toBe('esc');
    expect(comboFromEvent(ev('ArrowUp'))).toBe('up');
    expect(comboFromEvent(ev('F5'))).toBe('f5');
  });

  it('returns null for modifier-only presses', () => {
    expect(comboFromEvent(ev('Control'))).toBeNull();
    expect(comboFromEvent(ev('Shift'))).toBeNull();
    expect(comboFromEvent(ev('Meta'))).toBeNull();
  });

  it('combines modifiers in canonical order', () => {
    expect(comboFromEvent(ev('D', { ctrl: true }))).toBe('ctrl+d');
    expect(comboFromEvent(ev('D', { ctrl: true, shift: true, alt: true }))).toBe('ctrl+alt+shift+d');
    expect(comboToString({ ctrl: false, alt: false, shift: false, meta: false, key: 'x' })).toBe('x');
  });
});

describe('matchesEvent', () => {
  it('matches only the exact combo', () => {
    expect(matchesEvent(ev('d'), 'd')).toBe(true);
    expect(matchesEvent(ev('d', { ctrl: true }), 'ctrl+d')).toBe(true);
    expect(matchesEvent(ev('d'), 'ctrl+d')).toBe(false);
    expect(matchesEvent(ev('d', { ctrl: true }), 'd')).toBe(false);
    expect(matchesEvent(ev('l'), 'l')).toBe(true);
    expect(matchesEvent(ev('d'), null)).toBe(false);
    // CapsLock: key becomes 'D' but code still resolves to 'd'.
    expect(matchesEvent(ev('D', {}, 'KeyD'), 'd')).toBe(true);
  });
});

describe('display helpers', () => {
  it('renders pretty labels', () => {
    expect(displayShortcut('ctrl+d')).toBe('Ctrl + D');
    expect(displayShortcut('l')).toBe('L');
    expect(displayShortcut('shift+7')).toBe('Shift + 7');
    expect(displayShortcut('f2')).toBe('F2');
    expect(displayShortcut('meta+s')).toBe('Win + S');
    expect(shortcutChips('ctrl+d')).toEqual(['Ctrl', 'D']);
  });
});

describe('findShortcutConflict', () => {
  it('detects duplicate combos across actions', () => {
    expect(findShortcutConflict({ like: 'l', downloadAll: 'd', downloadCurrent: 'ctrl+d' })).toBeNull();
    expect(findShortcutConflict({ like: 'd', downloadAll: 'd' })).toBe('d');
    expect(findShortcutConflict({ like: 'l', downloadAll: 'ctrl+d', downloadCurrent: 'ctrl+d' })).toBe('ctrl+d');
    expect(findShortcutConflict({})).toBeNull();
    expect(findShortcutConflict({ like: 'x' })).toBeNull();
  });
});
