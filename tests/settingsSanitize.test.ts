// Settings patch validation: unknown keys dropped, types/enums/ranges
// enforced before anything is persisted.

import { describe, expect, it } from 'vitest';
import { sanitizeSettingsPatch, sanitizeShortcutsPatch } from '../src/shared/validators';

describe('sanitizeShortcutsPatch', () => {
  it('normalizes valid entries and drops invalid ones', () => {
    expect(sanitizeShortcutsPatch({ like: 'Ctrl+L', downloadAll: 'x', downloadCurrent: 'bogus<' })).toEqual({
      like: 'ctrl+l',
      downloadAll: 'x',
    });
  });

  it('returns null when no shortcut key is present at all', () => {
    expect(sanitizeShortcutsPatch({})).toBeNull();
    expect(sanitizeShortcutsPatch('nope')).toBeNull();
    expect(sanitizeShortcutsPatch(null)).toBeNull();
  });

  it('rejects modifier-only and unknown combos', () => {
    expect(sanitizeShortcutsPatch({ like: 'Shift' })).toEqual({});
  });
});

describe('sanitizeSettingsPatch', () => {
  it('accepts a valid theme', () => {
    expect(sanitizeSettingsPatch({ theme: 'dark' }).theme).toBe('dark');
    expect(sanitizeSettingsPatch({ theme: 'light' }).theme).toBe('light');
  });

  it('drops unknown theme values and unknown keys', () => {
    const out = sanitizeSettingsPatch({ theme: 'blue', hacker: true, shortcuts: undefined });
    expect(out.theme).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('passes through scalar settings unchanged', () => {
    const out = sanitizeSettingsPatch({
      maxConcurrentDownloads: 25,
      maxRetryAttempts: 0,
      notifications: true,
      duplicateBehavior: 'skip',
    });
    expect(out.maxConcurrentDownloads).toBe(10); // clamped
    expect(out.maxRetryAttempts).toBe(1); // clamped
    expect(out.notifications).toBe(true);
    expect(out.duplicateBehavior).toBe('skip');
  });

  it('normalizes shortcut patches inside settings patches', () => {
    const out = sanitizeSettingsPatch({ shortcuts: { like: 'K', downloadAll: 'Ctrl+X' } });
    expect(out.shortcuts).toEqual({ like: 'k', downloadAll: 'ctrl+x' });
  });

  it('sanitizes the user agent: empty resets, control chars stripped, long values dropped', () => {
    // Empty string explicitly resets to the built-in default.
    expect(sanitizeSettingsPatch({ userAgent: '   ' }).userAgent).toBe('');
    // Control characters are stripped, surrounding whitespace trimmed.
    expect(sanitizeSettingsPatch({ userAgent: '  MyAgent/1.0\nx\u0007y  ' }).userAgent).toBe('MyAgent/1.0xy');
    // Over-long values are dropped entirely (not truncated silently).
    expect(sanitizeSettingsPatch({ userAgent: 'a'.repeat(513) }).userAgent).toBeUndefined();
    expect(sanitizeSettingsPatch({ userAgent: 'a'.repeat(512) }).userAgent).toBe('a'.repeat(512));
    // Non-string values are ignored.
    expect(sanitizeSettingsPatch({ userAgent: 42 as unknown as string }).userAgent).toBeUndefined();
  });
});
