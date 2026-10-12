// Keyboard shortcut model shared by the renderer (recorder UI), the main
// process (validation) and the injection layer (event matching). Pure and
// environment-agnostic: no DOM/Electron imports (spec §37 + user request:
// shortcuts are now fully remappable in Settings).
import type { ShortcutConfig } from './types';

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  like: 'l',
  downloadAll: 'd',
  downloadCurrent: 'ctrl+d',
};

export const SHORTCUT_ACTIONS: { id: keyof ShortcutConfig; label: string; description: string }[] = [
  { id: 'like', label: 'Like', description: 'Like the hovered post or story' },
  { id: 'downloadAll', label: 'Download all', description: 'Download every slide of the hovered post' },
  { id: 'downloadCurrent', label: 'Download current', description: 'Download only the currently visible slide' },
];

export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

/** event.key (lowercased) -> canonical name. */
const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  spacebar: 'space',
  escape: 'esc',
  esc: 'esc',
  enter: 'enter',
  return: 'enter',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  pageup: 'pageup',
  pagedown: 'pagedown',
  home: 'home',
  end: 'end',
  insert: 'insert',
  delete: 'delete',
  backspace: 'backspace',
  tab: 'tab',
  minus: 'minus',
  equal: 'equal',
  comma: 'comma',
  period: 'period',
  slash: 'slash',
  semicolon: 'semicolon',
  quote: 'quote',
};

const MODIFIER_KEYS = new Set([
  'control',
  'ctrl',
  'shift',
  'alt',
  'meta',
  'cmd',
  'command',
  'option',
  'win',
  'super',
]);

const NAMED_KEYS = new Set<string>([
  ...Object.values(KEY_ALIASES),
  ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
]);

export function isModifierKeyName(key: string): boolean {
  return MODIFIER_KEYS.has(key.toLowerCase());
}

/** Canonical form: modifiers in fixed order (ctrl, alt, shift, meta), then key. */
export function comboToString(combo: Combo): string {
  const mods: string[] = [];
  if (combo.ctrl) mods.push('ctrl');
  if (combo.alt) mods.push('alt');
  if (combo.shift) mods.push('shift');
  if (combo.meta) mods.push('meta');
  return [...mods, combo.key].join('+');
}

/** Canonical key name from a KeyboardEvent-like object, or null for modifiers/unknown. */
export function eventKeyName(e: { key: string; code?: string }): string | null {
  // Prefer the physical code for letters/digits so Shift+'a' yields 'shift+a'
  // (not 'shift+A') and Shift+7 yields 'shift+7' (not 'shift+&').
  const code = typeof e.code === 'string' ? e.code : '';
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const key = e.key.toLowerCase();
  if (isModifierKeyName(key)) return null;
  if (key in KEY_ALIASES) return KEY_ALIASES[key];
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  if (/^[a-z0-9]$/.test(key)) return key;
  return null;
}

/** Parse + normalize a shortcut string like "Ctrl+Shift+7" -> "ctrl+shift+7". */
export function normalizeShortcut(input: string | undefined | null): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 64) return null;
  const parts = trimmed
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0 || parts.length > 5) return null;
  const key = parts[parts.length - 1];
  if (isModifierKeyName(key)) return null; // modifier-only combos are invalid
  const combo: Combo = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (const part of parts.slice(0, -1)) {
    if (part === 'control' || part === 'ctrl') {
      if (combo.ctrl) return null; // duplicate modifier
      combo.ctrl = true;
    } else if (part === 'option' || part === 'alt') {
      if (combo.alt) return null;
      combo.alt = true;
    } else if (part === 'shift') {
      if (combo.shift) return null;
      combo.shift = true;
    } else if (part === 'cmd' || part === 'command' || part === 'meta' || part === 'win' || part === 'super') {
      if (combo.meta) return null;
      combo.meta = true;
    } else {
      return null;
    }
  }
  const canonicalKey = key in KEY_ALIASES ? KEY_ALIASES[key] : key;
  if (NAMED_KEYS.has(canonicalKey) || /^[a-z0-9]$/.test(canonicalKey)) {
    combo.key = canonicalKey;
  } else {
    return null;
  }
  return comboToString(combo);
}

/** Canonical combo for a keyboard event (used by the recorder + injection layer). */
export function comboFromEvent(e: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  const key = eventKeyName(e);
  if (!key) return null;
  return comboToString({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, key });
}

/** True when the event presses exactly this (already normalized) combo. */
export function matchesEvent(
  e: Parameters<typeof comboFromEvent>[0],
  normalized: string | null | undefined,
): boolean {
  if (!normalized) return false;
  return comboFromEvent(e) === normalized;
}

/** Pretty form for the UI: "ctrl+d" -> "Ctrl + D", "l" -> "L", "f2" -> "F2". */
export function displayShortcut(normalized: string): string {
  return normalized
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'Ctrl';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (part === 'meta') return 'Win';
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' + ');
}

/** Individual chips for rendering: ['Ctrl', 'D']. */
export function shortcutChips(normalized: string): string[] {
  return displayShortcut(normalized).split(' + ');
}

/** First duplicated combo in a (partial) config, or null when there is no conflict. */
export function findShortcutConflict(config: Partial<ShortcutConfig>): string | null {
  const seen = new Map<string, string>();
  for (const [action, combo] of Object.entries(config)) {
    if (typeof combo !== 'string' || combo.length === 0) continue;
    const existing = seen.get(combo);
    if (existing && existing !== action) return combo;
    seen.set(combo, action);
  }
  return null;
}
