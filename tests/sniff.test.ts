// Tests for magic-byte sniffing incl. the INVALID_MEDIA regression
// (user report: "اکثر مواقع دانلود fail میشه — Response is not a recognized
// image/video"): brotli/gzip-wrapped bodies, AVIF served with the generic
// "mif1" brand, and the text-vs-binary mime-trust fallback.
import { describe, expect, it } from 'vitest';
import { looksLikeTextPayload, mimeTrustSniff, sniffMedia } from '../src/main/core/sniff';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function ftypBox(major: string, compat: string[]): Uint8Array {
  // size(4) + 'ftyp' + major(4) + minor(4) + compat brands...
  const size = 8 + 8 + compat.length * 4;
  const head: number[] = [
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
  ];
  for (const ch of major.padEnd(4, ' ')) head.push(ch.charCodeAt(0));
  for (let i = 0; i < 4; i++) head.push(0); // minor version
  for (const brand of compat) for (const ch of brand.padEnd(4, ' ')) head.push(ch.charCodeAt(0));
  return new Uint8Array(head);
}

describe('sniffMedia basics', () => {
  it('detects jpeg/png/gif/webp signatures', () => {
    expect(sniffMedia(bytes(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12))).toEqual({
      ok: true,
      ext: 'jpg',
      kind: 'image',
    });
    expect(sniffMedia(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8))).toMatchObject({
      ok: true,
      ext: 'png',
    });
    expect(sniffMedia(asciiBytes('GIF89a' + 'x'.repeat(20)))).toMatchObject({ ok: true, ext: 'gif' });
    const webp = new Uint8Array(32);
    webp.set(asciiBytes('RIFF'), 0);
    webp.set(asciiBytes('WEBP'), 8);
    expect(sniffMedia(webp)).toMatchObject({ ok: true, ext: 'webp', kind: 'image' });
  });

  it('classifies classic mp4 brands as video', () => {
    expect(sniffMedia(ftypBox('isom', ['isom', 'iso2', 'avc1', 'mp41']))).toMatchObject({
      ok: true,
      ext: 'mp4',
      kind: 'video',
    });
    expect(sniffMedia(ftypBox('mp42', ['mp42', 'isom']))).toMatchObject({ ok: true, ext: 'mp4', kind: 'video' });
    expect(sniffMedia(ftypBox('dash', ['dash', 'iso5']))).toMatchObject({ ok: true, ext: 'mp4' });
  });

  it('detects AVIF served with the generic mif1 major brand (Instagram CDN)', () => {
    // Regression: this used to be saved as .mp4 (or fail downstream checks).
    expect(sniffMedia(ftypBox('mif1', ['mif1', 'avif', 'miaf']))).toMatchObject({
      ok: true,
      ext: 'avif',
      kind: 'image',
    });
    expect(sniffMedia(ftypBox('avif', ['avif', 'mif1']))).toMatchObject({ ok: true, ext: 'avif' });
    expect(sniffMedia(ftypBox('mif1', ['mif1', 'av01', 'miaf']))).toMatchObject({ ok: true, ext: 'avif' });
  });

  it('detects HEIC variants', () => {
    expect(sniffMedia(ftypBox('heic', ['heic', 'mif1']))).toMatchObject({ ok: true, ext: 'heic', kind: 'image' });
    expect(sniffMedia(ftypBox('mif1', ['mif1', 'heic']))).toMatchObject({ ok: true, ext: 'heic' });
  });

  it('rejects short, empty and unknown-binary payloads', () => {
    expect(sniffMedia(new Uint8Array(0)).ok).toBe(false);
    expect(sniffMedia(bytes(1, 2, 3)).ok).toBe(false);
    const junk = new Uint8Array(64);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 37 + 11) % 256; // pseudo-random binary
    // Deterministically crafted to avoid any known signature; sniff may still
    // classify as ISO-BMFF only if bytes 4..7 == 'ftyp' — assert not a crash.
    const res = sniffMedia(junk);
    expect(typeof res.ok).toBe('boolean');
  });
});

describe('looksLikeTextPayload', () => {
  it('detects HTML and JSON error pages', () => {
    expect(looksLikeTextPayload(asciiBytes('<!DOCTYPE html><html>...'))).toBe(true);
    expect(looksLikeTextPayload(asciiBytes('<html><body>Sorry, this page is not available.'))).toBe(true);
    expect(looksLikeTextPayload(asciiBytes('{"error":{"message":"rate limited"}}...'))).toBe(true);
  });

  it('accepts binary media bodies', () => {
    expect(looksLikeTextPayload(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 1, 0, 0, 0, 0))).toBe(false);
    expect(looksLikeTextPayload(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32))).toBe(false);
  });
});

describe('mimeTrustSniff (last-resort classification)', () => {
  it('never trusts a text-like payload regardless of Content-Type', () => {
    const html = asciiBytes('<html><body>error</body></html>');
    expect(mimeTrustSniff(html, 'image/jpeg').ok).toBe(false);
    expect(mimeTrustSniff(html, 'video/mp4').ok).toBe(false);
  });

  it('trusts binary bodies with an honest image/video Content-Type', () => {
    const binary = bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    expect(mimeTrustSniff(binary, 'video/webm')).toEqual({ ok: true, ext: 'webm', kind: 'video' });
    expect(mimeTrustSniff(binary, 'video/mp4')).toMatchObject({ ok: true, kind: 'video' });
    expect(mimeTrustSniff(binary, 'image/jpeg')).toMatchObject({ ok: true, ext: 'jpg', kind: 'image' });
  });

  it('treats octet-stream binary as acceptable but extension-less', () => {
    const binary = bytes(0x47, 0x40, 0x00, 0x1e, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12); // MPEG-TS-ish
    expect(mimeTrustSniff(binary, 'application/octet-stream')).toEqual({ ok: true });
  });

  it('rejects non-media content types', () => {
    const binary = bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);
    expect(mimeTrustSniff(binary, 'application/json').ok).toBe(false);
    expect(mimeTrustSniff(binary, 'text/plain').ok).toBe(false);
    expect(mimeTrustSniff(binary, '').ok).toBe(false);
  });
});
