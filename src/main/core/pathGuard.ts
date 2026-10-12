// Destination path containment (spec §45). The backend canonicalizes every
// destination; escaping the Download Root via traversal or absolute paths is
// impossible. Segments containing separators or ".." are explicitly rejected.
import path from 'node:path';

const SEGMENT_FORBIDDEN = /[/\\]|\.\./;

/** Cleans a single path segment (defense in depth on top of resolveInsideRoot). */
export function sanitizeSegment(input: unknown): string {
  const cleaned = String(input ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
    .replace(/^[.\s]+/, '')
    .trim();
  return cleaned || '_';
}

function rootWithSep(rootAbs: string): string {
  return rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
}

/** Resolves segments against the root and throws if the result escapes it. */
export function resolveInsideRoot(root: string, ...segments: string[]): string {
  for (const segment of segments) {
    if (SEGMENT_FORBIDDEN.test(segment)) throw new Error('PATH_ESCAPE_BLOCKED');
  }
  const rootAbs = path.resolve(root);
  const target = path.resolve(rootAbs, ...segments);
  if (target !== rootAbs && !target.startsWith(rootWithSep(rootAbs))) {
    throw new Error('PATH_ESCAPE_BLOCKED');
  }
  return target;
}

export function isInsideRoot(root: string, target: string): boolean {
  const rootAbs = path.resolve(root);
  const t = path.resolve(target);
  return t === rootAbs || t.startsWith(rootWithSep(rootAbs));
}
