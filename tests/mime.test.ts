import { describe, expect, it } from 'vitest';
import { extForMime, extFromUrl } from '../src/main/core/mime';
import { sniffMedia } from '../src/main/core/sniff';

describe('extForMime', () => {
  it('maps common image and video types', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/png')).toBe('png');
    expect(extForMime('image/webp')).toBe('webp');
    expect(extForMime('video/mp4')).toBe('mp4');
  });

  it('is case-insensitive and strips parameters', () => {
    expect(extForMime('IMAGE/JPEG; charset=binary')).toBe('jpg');
  });

  it('returns undefined for unknown or missing types', () => {
    expect(extForMime('application/octet-stream')).toBeUndefined();
    expect(extForMime(undefined)).toBeUndefined();
    expect(extForMime('')).toBeUndefined();
  });
});

describe('extFromUrl', () => {
  it('reads the extension from the path', () => {
    expect(extFromUrl('https://cdn.instagram.com/a/b.mp4?sig=1')).toBe('mp4');
    expect(extFromUrl('https://cdn.instagram.com/a/photo.WEBP')).toBe('webp');
  });

  it('returns undefined when there is no extension', () => {
    expect(extFromUrl('https://cdn.instagram.com/a/b')).toBeUndefined();
    expect(extFromUrl('not a url')).toBeUndefined();
  });
});

describe('sniffMedia (magic bytes)', () => {
  it('detects JPEG', () => {
    const head = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffMedia(head)).toMatchObject({ ok: true, ext: 'jpg', kind: 'image' });
  });

  it('detects PNG', () => {
    const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffMedia(head)).toMatchObject({ ok: true, ext: 'png', kind: 'image' });
  });

  it('detects WEBP (RIFF....WEBP)', () => {
    const head = new Uint8Array([...Buffer.from('RIFF    WEBP')]);
    expect(sniffMedia(head)).toMatchObject({ ok: true, ext: 'webp', kind: 'image' });
  });

  it('detects MP4 via ftyp box', () => {
    const head = new Uint8Array([...Buffer.from('    ftypisom    ')]);
    expect(sniffMedia(head)).toMatchObject({ ok: true, ext: 'mp4', kind: 'video' });
  });

  it('rejects HTML error pages and empty buffers', () => {
    const html = new Uint8Array([...Buffer.from('<html><body>Err')]);
    expect(sniffMedia(html).ok).toBe(false);
    expect(sniffMedia(new Uint8Array(4)).ok).toBe(false);
  });
});
