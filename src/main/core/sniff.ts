// Magic-byte sniffing: verifies the downloaded binary is actually an image or
// video and derives the truthful extension. Prevents saving HTML error pages
// as .jpg files (spec §9/§30/§31 INVALID_MEDIA).
export interface SniffResult {
  ok: boolean;
  ext?: string;
  kind?: 'image' | 'video';
}

function startsWith(b: Uint8Array, sig: number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  return sig.every((v, i) => b[offset + i] === v);
}

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < Math.min(to, b.length); i++) s += String.fromCharCode(b[i]);
  return s;
}

export function sniffMedia(head: Uint8Array): SniffResult {
  if (!head || head.length < 12) return { ok: false };
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { ok: true, ext: 'jpg', kind: 'image' };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return { ok: true, ext: 'png', kind: 'image' };
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { ok: true, ext: 'webp', kind: 'image' };
  }
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return { ok: true, ext: 'gif', kind: 'image' };
  // ISO-BMFF family: bytes 4..7 == "ftyp". The major brand alone is not
  // enough: Instagram's CDN often serves AVIF with the generic "mif1" brand
  // and "avif" only in the compatible-brands list, which used to make these
  // images fall through to the mp4 branch (saved as .mp4).
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) {
    const major = ascii(head, 8, 12);
    const compat: string[] = ascii(head, 12, Math.min(head.length, 64)).match(/[A-Za-z0-9]{4}/g) ?? [];
    const has = (b: string) => compat.includes(b);
    if (major === 'avif' || major === 'avis') return { ok: true, ext: 'avif', kind: 'image' };
    if (major === 'heic' || major === 'heix' || major === 'hevc' || major === 'heim' || major === 'hevx') {
      return { ok: true, ext: 'heic', kind: 'image' };
    }
    // HEIF still-image container family: classify by compatible brands and
    // default to a still image (MP4 videos use isom/mp42/dash/iso* majors).
    if (major === 'mif1' || major === 'miaf' || major === 'msf1' || major === 'mif2') {
      if (has('avif') || has('avis') || has('av01')) return { ok: true, ext: 'avif', kind: 'image' };
      if (has('heic') || has('heix') || has('hevc') || has('heim')) {
        return { ok: true, ext: 'heic', kind: 'image' };
      }
      return { ok: true, ext: 'heic', kind: 'image' };
    }
    return { ok: true, ext: 'mp4', kind: 'video' };
  }
  return { ok: false };
}

/**
 * True when the payload looks like HTML/JSON/text — i.e. an error page rather
 * than media. Such payloads are NEVER saved, even when the Content-Type claims
 * image/video (a mismatched Content-Type must not launder an error page).
 */
export function looksLikeTextPayload(head: Uint8Array): boolean {
  if (!head || head.length < 4) return true;
  // Skip a leading UTF-8 BOM.
  const start = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 3 : 0;
  let text = '';
  for (let i = start; i < Math.min(head.length, start + 64); i++) {
    const c = head[i];
    if (c === 0 || c < 0x09) return false; // binary control byte -> not text
    text += String.fromCharCode(c);
  }
  const t = text.trimStart().toLowerCase();
  if (t.startsWith('<') || t.startsWith('{') || t.startsWith('html')) return true;
  return /<!doctype|<html|<body|<script|\{"error"|window\._|http-equiv/.test(t);
}

/**
 * Last-resort classification when magic bytes are unrecognized but the payload
 * is clearly binary and the response Content-Type honestly says image/video.
 * This rescues exotic-but-real media (brandless MP4 variants, MPEG-TS, raw
 * HEVC) instead of failing the whole download, while text-like payloads are
 * still rejected.
 */
export function mimeTrustSniff(head: Uint8Array, mime: string): SniffResult {
  if (looksLikeTextPayload(head)) return { ok: false };
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (m.startsWith('video/')) return { ok: true, ext: m === 'video/quicktime' ? 'mov' : m === 'video/webm' ? 'webm' : 'mp4', kind: 'video' };
  if (m.startsWith('image/')) {
    const ext = m === 'image/jpeg' || m === 'image/jpg' ? 'jpg' : m.split('/')[1]?.replace(/[^a-z0-9]/g, '');
    return { ok: true, ext: ext || 'jpg', kind: 'image' };
  }
  if (m === 'application/octet-stream') {
    // Unmarked binary from a media CDN: still accept as generic media, but
    // only via the caller's job-level extension (no ext override here).
    return { ok: true };
  }
  return { ok: false };
}
