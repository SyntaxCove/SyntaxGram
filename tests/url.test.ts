import { describe, expect, it } from 'vitest';
import { checkMediaUrl, isAllowedMediaUrl } from '../src/main/core/urlGuard';

describe('checkMediaUrl (spec §44)', () => {
  it('accepts https media URLs on Instagram/CDN hosts', () => {
    expect(isAllowedMediaUrl('https://scontent.cdninstagram.com/v/t51.2885-15/a.jpg?efg=xyz')).toBe(true);
    expect(isAllowedMediaUrl('https://scontent-fra5-1.cdninstagram.com/v/t50.2886-52/a.mp4')).toBe(true);
    expect(isAllowedMediaUrl('https://scontent.xx.fbcdn.net/v/t51/a.webp')).toBe(true);
    expect(isAllowedMediaUrl('https://www.instagram.com/p/abc123/')).toBe(true);
  });

  it('rejects javascript:, data:, file: and blob: schemes', () => {
    expect(checkMediaUrl('javascript:alert(1)').reason).toBe('BLOCKED_SCHEME');
    expect(checkMediaUrl('data:image/png;base64,AAAA').reason).toBe('BLOCKED_SCHEME');
    expect(checkMediaUrl('file:///C:/Windows/system32/config.sys').reason).toBe('BLOCKED_SCHEME');
    expect(checkMediaUrl('blob:https://www.instagram.com/xyz').reason).toBe('BLOCKED_SCHEME');
  });

  it('rejects insecure and unknown hosts', () => {
    expect(checkMediaUrl('http://scontent.cdninstagram.com/a.jpg').reason).toBe('INSECURE_SCHEME');
    expect(checkMediaUrl('https://evil.example.com/a.jpg').reason).toBe('UNTRUSTED_HOST');
    expect(checkMediaUrl('https://cdninstagram.com.evil.com/a.jpg').reason).toBe('UNTRUSTED_HOST');
  });

  it('rejects malformed input and userinfo tricks', () => {
    expect(checkMediaUrl('not a url').ok).toBe(false);
    expect(checkMediaUrl('').ok).toBe(false);
    expect(checkMediaUrl(null).ok).toBe(false);
    expect(checkMediaUrl(`https://user:pass@www.instagram.com/a.jpg`).ok).toBe(false);
    expect(checkMediaUrl('x'.repeat(3000)).ok).toBe(false);
  });
});
