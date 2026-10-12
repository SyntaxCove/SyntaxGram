// Runtime validation guards for every message that crosses a trust boundary.
// All IPC payloads (renderer -> main and instagram-injection -> main) are
// validated with these pure helpers (spec §42/§43).
import type {
  AppSettingsPatch,
  DownloadRequestPayload,
  LayoutInfo,
  MediaCandidate,
  MediaSourceKind,
  RegistryQuery,
  ShortcutConfig,
  ToastPayload,
} from './types';
import { normalizeShortcut } from './shortcuts';

const MAX_URL_LEN = 2048;
const MAX_CANDIDATES = 40;
const MAX_STR = 300;

const CONTEXTS = new Set(['post-single', 'carousel-current', 'carousel-all', 'story']);
const SOURCES = new Set<MediaSourceKind>(['dom', 'metadata', 'resource', 'network']);
const MEDIA_TYPES = new Set(['image', 'video']);

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown, max = MAX_STR): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

export function isMediaCandidate(v: unknown): v is MediaCandidate {
  if (!isPlainObject(v)) return false;
  if (typeof v.url !== 'string' || v.url.length === 0 || v.url.length > MAX_URL_LEN) return false;
  if (typeof v.mediaType !== 'string' || !MEDIA_TYPES.has(v.mediaType)) return false;
  if (typeof v.source !== 'string' || !SOURCES.has(v.source as MediaSourceKind)) return false;
  for (const k of ['width', 'height', 'slideIndex'] as const) {
    if (v[k] !== undefined && (typeof v[k] !== 'number' || !Number.isFinite(v[k]))) return false;
  }
  if (v.mimeType !== undefined && !isNonEmptyString(v.mimeType, 100)) return false;
  return true;
}

export function isDownloadRequestPayload(v: unknown): v is DownloadRequestPayload {
  if (!isPlainObject(v)) return false;
  if (typeof v.context !== 'string' || !CONTEXTS.has(v.context)) return false;
  if (typeof v.username !== 'string' || v.username.length > 100) return false;
  if (v.postId !== undefined && !isNonEmptyString(v.postId, 64)) return false;
  if (v.storyId !== undefined && !isNonEmptyString(v.storyId, 64)) return false;
  if (typeof v.currentIndex !== 'number' || !Number.isFinite(v.currentIndex)) return false;
  if (!Array.isArray(v.candidates) || v.candidates.length === 0 || v.candidates.length > MAX_CANDIDATES) return false;
  return v.candidates.every((c) => isMediaCandidate(c));
}

export function isRegistryQuery(v: unknown): v is RegistryQuery {
  if (v === undefined || v === null) return true;
  if (!isPlainObject(v)) return false;
  if (v.mediaType !== undefined && (typeof v.mediaType !== 'string' || !MEDIA_TYPES.has(v.mediaType))) return false;
  if (v.limit !== undefined && (typeof v.limit !== 'number' || v.limit < 1 || v.limit > 50)) return false;
  if (v.sinceMs !== undefined && (typeof v.sinceMs !== 'number' || v.sinceMs < 0)) return false;
  return true;
}

export function isToastPayload(v: unknown): v is ToastPayload {
  return isPlainObject(v) && isNonEmptyString(v.message, 300) && typeof v.kind === 'string' &&
    ['success', 'error', 'info'].includes(v.kind);
}

export function isLayoutInfo(v: unknown): v is LayoutInfo {
  if (!isPlainObject(v)) return false;
  if (typeof v.page !== 'string' || v.page.length > 40) return false;
  for (const k of ['sidebarWidth', 'headerHeight', 'toolbarHeight'] as const) {
    if (typeof v[k] !== 'number' || !Number.isFinite(v[k]) || v[k] < 0 || v[k] > 2000) return false;
  }
  return true;
}

export function isJobId(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 8 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
}

export function isNavAction(v: unknown): v is 'back' | 'forward' | 'reload' | 'home' {
  return v === 'back' || v === 'forward' || v === 'reload' || v === 'home';
}

const DUPLICATE_BEHAVIORS = new Set(['unique', 'overwrite', 'skip']);
const THEMES = new Set(['light', 'dark']);

/**
 * Normalize a shortcuts patch: each entry must parse as a real key combo.
 * Invalid entries are dropped (the manager merges with the current config).
 */
export function sanitizeShortcutsPatch(v: unknown): Partial<ShortcutConfig> | null {
  if (!isPlainObject(v)) return null;
  const out: Partial<ShortcutConfig> = {};
  let sawAny = false;
  for (const k of ['like', 'downloadAll', 'downloadCurrent'] as const) {
    if (v[k] !== undefined) sawAny = true;
    const normalized = normalizeShortcut(v[k] as string | undefined);
    if (normalized) out[k] = normalized;
  }
  return sawAny ? out : null;
}

/** Strict allow-list validation for settings patches. Unknown keys are dropped. */
export function sanitizeSettingsPatch(v: unknown): AppSettingsPatch {
  const out: AppSettingsPatch = {};
  if (!isPlainObject(v)) return out;
  if (typeof v.downloadRoot === 'string' && v.downloadRoot.length > 0 && v.downloadRoot.length <= 500) {
    out.downloadRoot = v.downloadRoot;
  }
  if (typeof v.maxConcurrentDownloads === 'number' && Number.isFinite(v.maxConcurrentDownloads)) {
    out.maxConcurrentDownloads = Math.min(10, Math.max(1, Math.round(v.maxConcurrentDownloads)));
  }
  if (typeof v.maxRetryAttempts === 'number' && Number.isFinite(v.maxRetryAttempts)) {
    out.maxRetryAttempts = Math.min(10, Math.max(1, Math.round(v.maxRetryAttempts)));
  }
  if (typeof v.duplicateBehavior === 'string' && DUPLICATE_BEHAVIORS.has(v.duplicateBehavior)) {
    out.duplicateBehavior = v.duplicateBehavior as AppSettingsPatch['duplicateBehavior'];
  }
  for (const k of ['notifications', 'startWithWindows', 'minimizeToTray'] as const) {
    if (typeof v[k] === 'boolean') out[k] = v[k];
  }
  if (typeof v.theme === 'string' && THEMES.has(v.theme)) {
    out.theme = v.theme as AppSettingsPatch['theme'];
  }
  if (typeof v.userAgent === 'string') {
    // Strip control characters; empty string explicitly resets to the
    // built-in default user agent. Anything else is capped to 512 chars.
    const ua = v.userAgent.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (ua.length === 0) out.userAgent = '';
    else if (ua.length <= 512) out.userAgent = ua;
  }
  const shortcuts = sanitizeShortcutsPatch(v.shortcuts);
  if (shortcuts) out.shortcuts = shortcuts as ShortcutConfig;
  return out;
}
