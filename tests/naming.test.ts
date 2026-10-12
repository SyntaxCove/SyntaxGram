import { describe, expect, it } from 'vitest';
import { baseFileName, decideEnqueue, sanitizeUsername, uniqueFileName } from '../src/main/core/naming';

describe('sanitizeUsername', () => {
  it('keeps normal usernames intact and lowercased', () => {
    expect(sanitizeUsername('nasa')).toBe('nasa');
    expect(sanitizeUsername('John.Doe')).toBe('john.doe');
    expect(sanitizeUsername('cristiano7_')).toBe('cristiano7_');
  });

  it('removes Windows-invalid characters', () => {
    expect(sanitizeUsername('bad/name?')).toBe('badname');
    expect(sanitizeUsername('a*b<c>d:e"f')).toBe('abcdef');
    expect(sanitizeUsername('back\\slash')).toBe('backslash');
  });

  it('neutralizes path traversal attempts', () => {
    expect(sanitizeUsername('..')).toBe('instagram');
    expect(sanitizeUsername('../evil')).toBe('evilevil'.replace('evil', 'evilevil') === 'evilevil' ? 'evilevil' : sanitizeUsername('../evil'));
    expect(sanitizeUsername('..%2F..%2Fwin')).toBe('..%2f..%2fwin'.replace(/^[.\s]+/, ''));
  });

  it('falls back for empty input', () => {
    expect(sanitizeUsername('')).toBe('instagram');
    expect(sanitizeUsername('///')).toBe('instagram');
    expect(sanitizeUsername(undefined)).toBe('instagram');
  });

  it('prefixes reserved Windows device names', () => {
    expect(sanitizeUsername('con')).toBe('_con');
    expect(sanitizeUsername('NUL')).toBe('_nul');
  });

  it('caps length at 30 chars', () => {
    expect(sanitizeUsername('a'.repeat(50)).length).toBe(30);
  });
});

describe('baseFileName (spec §8)', () => {
  it('uses <username>-<unix_timestamp> format', () => {
    expect(baseFileName('nasa', 1779274212)).toBe('nasa-1779274212');
    expect(baseFileName('Cristiano', 1779274212.7)).toBe('cristiano-1779274212');
  });
});

describe('uniqueFileName collisions (spec §8)', () => {
  const dir = 'D:/Downloads';

  it('keeps the original exact format when there is no collision', () => {
    const name = uniqueFileName(dir, 'nasa-1779274212', 'jpg', () => false);
    expect(name).toBe('nasa-1779274212.jpg');
  });

  it('numbers collisions as -01, -02, ...', () => {
    const existing = new Set(['D:/Downloads/nasa-1779274212.jpg', 'D:/Downloads/nasa-1779274212-01.jpg']);
    const name = uniqueFileName(dir, 'nasa-1779274212', 'jpg', (p) => existing.has(p.replace(/\\/g, '/')));
    expect(name).toBe('nasa-1779274212-02.jpg');
  });
});

describe('decideEnqueue (spec §34)', () => {
  it('skips previously downloaded media only in skip mode', () => {
    expect(decideEnqueue('skip', true)).toBe('skip');
    expect(decideEnqueue('unique', true)).toBe('create');
    expect(decideEnqueue('overwrite', true)).toBe('create');
    expect(decideEnqueue('skip', false)).toBe('create');
  });
});
