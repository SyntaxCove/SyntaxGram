// Pure filename/path naming rules (spec §7, §8, §34).
import { join } from 'node:path';

export const WINDOWS_RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001F]/g;

/**
 * Sanitizes an Instagram username so it can never produce an invalid or
 * dangerous Windows path segment (no separators, no traversal, no reserved
 * device names, bounded length).
 */
export function sanitizeUsername(input: unknown): string {
  let s = String(input ?? '').trim().toLowerCase();
  s = s.replace(INVALID_CHARS, '').replace(/\s+/g, '');
  // Strip leading/trailing dots/spaces (Windows dislikes them; kills ".." too).
  s = s.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  s = s.slice(0, 30);
  if (!s) return 'instagram';
  const stem = s.split('.')[0] ?? '';
  if (WINDOWS_RESERVED.has(stem.toUpperCase())) s = `_${s}`;
  return s;
}

/** "<username>-<unix_timestamp>" base name (spec §8). */
export function baseFileName(username: unknown, timestampSeconds: number): string {
  return `${sanitizeUsername(username)}-${Math.floor(timestampSeconds)}`;
}

/**
 * Collisions are resolved deterministically (spec §8):
 *   username-1779274212.jpg -> username-1779274212-01.jpg -> -02.jpg ...
 * The original format is kept exactly as long as no collision exists.
 */
export function uniqueFileName(
  dir: string,
  base: string,
  ext: string,
  exists: (p: string) => boolean,
): string {
  const extClean = ext.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toLowerCase() || 'bin';
  let name = `${base}.${extClean}`;
  if (!exists(join(dir, name))) return name;
  for (let i = 1; i < 1000; i++) {
    name = `${base}-${String(i).padStart(2, '0')}.${extClean}`;
    if (!exists(join(dir, name))) return name;
  }
  return `${base}-${Date.now()}.${extClean}`;
}

/** Decides whether an identical media should be enqueued again (spec §34). */
export function decideEnqueue(
  behavior: 'unique' | 'overwrite' | 'skip',
  previouslyDownloaded: boolean,
): 'create' | 'skip' {
  if (previouslyDownloaded && behavior === 'skip') return 'skip';
  return 'create';
}
