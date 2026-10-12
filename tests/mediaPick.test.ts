import { describe, expect, it } from 'vitest';
import { bestOf, pickPerSlide, scoreCandidate } from '../src/main/core/mediaPick';
import type { MediaCandidate } from '../src/shared/types';

function img(source: MediaCandidate['source'], width: number, slide = 0): MediaCandidate {
  return { url: `https://cdn/${source}-${width}-${slide}`, mediaType: 'image', source, width, slideIndex: slide };
}

function vid(source: MediaCandidate['source'], slide = 0): MediaCandidate {
  return { url: `https://cdn/${source}-vid-${slide}.mp4`, mediaType: 'video', source, slideIndex: slide };
}

describe('pickPerSlide', () => {
  it('prefers video when a slide contains one', () => {
    const picked = pickPerSlide([img('dom', 1080), vid('network')]);
    expect(picked).toHaveLength(1);
    expect(picked[0].mediaType).toBe('video');
  });

  it('picks the largest image for a slide', () => {
    const picked = pickPerSlide([img('dom', 640), img('dom', 1080), img('dom', 2160)]);
    expect(picked[0].url).toContain('2160');
  });

  it('breaks width ties by source quality (dom > metadata > resource > network)', () => {
    expect(scoreCandidate(img('dom', 1080))).toBeGreaterThan(scoreCandidate(img('resource', 1080)));
    const picked = pickPerSlide([img('resource', 1080), img('dom', 1080)]);
    expect(picked[0].source).toBe('dom');
  });

  it('groups by slide and preserves slide order (spec §15)', () => {
    const picked = pickPerSlide([
      img('dom', 640, 2),
      vid('dom', 1),
      img('dom', 1080, 0),
      img('dom', 4000, 2),
    ]);
    expect(picked.map((p) => p.slideIndex)).toEqual([0, 1, 2]);
    expect(picked[0].url).toContain('1080');
    expect(picked[1].mediaType).toBe('video');
    expect(picked[2].url).toContain('4000');
  });

  it('falls back to the other media type when the preferred one is missing', () => {
    const picked = pickPerSlide([img('dom', 800)], 'video');
    expect(picked[0].mediaType).toBe('image');
  });

  it('bestOf returns undefined for empty input', () => {
    expect(bestOf([], 'image')).toBeUndefined();
  });
});
