import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isInsideRoot, resolveInsideRoot, sanitizeSegment } from '../src/main/core/pathGuard';

describe('resolveInsideRoot (spec §45)', () => {
  const root = path.resolve('/tmp/downloads-root');

  it('resolves simple segments inside the root', () => {
    const p = resolveInsideRoot(root, 'nasa', 'images', 'nasa-1779274212.jpg');
    expect(p.startsWith(root + path.sep)).toBe(true);
    expect(p).toBe(path.join(root, 'nasa', 'images', 'nasa-1779274212.jpg'));
  });

  it('blocks traversal via relative segments', () => {
    expect(() => resolveInsideRoot(root, '..', 'escape.jpg')).toThrow('PATH_ESCAPE_BLOCKED');
    expect(() => resolveInsideRoot(root, 'nasa', '..', '..', '..', 'win')).toThrow('PATH_ESCAPE_BLOCKED');
  });

  it('blocks absolute paths that escape the root', () => {
    expect(() => resolveInsideRoot(root, '/etc/passwd')).toThrow('PATH_ESCAPE_BLOCKED');
    if (process.platform === 'win32') {
      expect(() => resolveInsideRoot(root, 'D:\\Other\\file.jpg')).toThrow('PATH_ESCAPE_BLOCKED');
    }
  });

  it('isInsideRoot agrees with resolveInsideRoot', () => {
    const inside = resolveInsideRoot(root, 'user', 'images', 'x.jpg');
    expect(isInsideRoot(root, inside)).toBe(true);
    expect(isInsideRoot(root, path.resolve('/tmp/other/x.jpg'))).toBe(false);
  });
});

describe('sanitizeSegment', () => {
  it('strips separators and control characters', () => {
    expect(sanitizeSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(sanitizeSegment('..hidden')).toBe('hidden');
    expect(sanitizeSegment('')).toBe('_');
  });
});
