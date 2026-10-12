// URL validation (spec §44). Only https:// URLs on Instagram/Facebook CDN
// hosts are accepted for downloads. javascript:, data:, file:, blob: and any
// non-https scheme are rejected. This is a pure allow-list — nothing is ever
// rewritten (Instagram CDN URLs are signed; modifying them breaks them).

const ALLOWED_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'cdninstagram.com',
  'fbcdn.net',
]);

const ALLOWED_SUFFIXES = ['.instagram.com', '.cdninstagram.com', '.fbcdn.net'];

const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'blob:', 'vbscript:']);

export type UrlRejectReason =
  | 'INVALID_URL'
  | 'BLOCKED_SCHEME'
  | 'INSECURE_SCHEME'
  | 'UNTRUSTED_HOST';

export interface UrlCheck {
  ok: boolean;
  reason?: UrlRejectReason;
}

export function checkMediaUrl(raw: unknown): UrlCheck {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    return { ok: false, reason: 'INVALID_URL' };
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'INVALID_URL' };
  }
  if (BLOCKED_SCHEMES.has(u.protocol)) return { ok: false, reason: 'BLOCKED_SCHEME' };
  if (u.protocol !== 'https:') return { ok: false, reason: 'INSECURE_SCHEME' };
  if (u.username || u.password) return { ok: false, reason: 'UNTRUSTED_HOST' };
  const host = u.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return { ok: true };
  if (ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { ok: true };
  return { ok: false, reason: 'UNTRUSTED_HOST' };
}

export function isAllowedMediaUrl(raw: unknown): boolean {
  return checkMediaUrl(raw).ok;
}
