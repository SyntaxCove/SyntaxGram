/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// @vitest-environment jsdom

// Carousel expansion regression (v0.2.2): Instagram only keeps the first
// ~3 slide <li> nodes in the DOM; walking the real Next button must capture
// every slide index and restore the original scroll position.
// Carousel virtualization regression (v0.2.4, user report: "the slides flip
// through to the end but still only 3 get downloaded"): Instagram also
// VIRTUALIZES the carousel — only a small window of <li> nodes stays in the
// DOM and navigation can be transform-based (scrollLeft never changes). The
// walk must therefore (a) detect the active slide by viewport geometry,
// (b) freeze each slide's media while it is on screen and (c) walk the track
// round-trip (Next to the end, Prev back to the start) to recover the true
// absolute slide indexing.
import { beforeEach, describe, expect, it } from 'vitest';
import { CarouselAdapter } from '../src/injection/adapters';
import { MediaResolver } from '../src/injection/resolvers';
import type { InstagramBridgeApi, MediaRecord } from '../src/shared/types';

const INITIAL = 3; // what Instagram initially keeps in the DOM
const TOTAL = 10; // the real slide count of the post
const SLIDE_W = 300; // emulated slide width (jsdom has no layout engine)

function rect(left: number, width = SLIDE_W): DOMRect {
  return { left, right: left + width, width, top: 0, bottom: 600, height: 600, x: left, y: 0 } as unknown as DOMRect;
}

function makeSlide(i: number, withMedia = true): HTMLElement {
  const li = document.createElement('li');
  if (withMedia) {
    const img = document.createElement('img');
    img.src = `https://cdninstagram.com/post-123/slide-${i}.jpg`;
    img.alt = `slide ${i}`;
    li.appendChild(img);
  }
  return li;
}

interface Fixture {
  post: HTMLElement;
  track: HTMLElement;
  next: HTMLButtonElement;
}

/** Appends slide `i` to the track and installs geometry so the walk's
 * rect-overlap detection sees a real 300px-per-slide layout. */
function attachSlide(track: HTMLElement, i: number, withMedia = true): void {
  const li = makeSlide(i, withMedia);
  li.getBoundingClientRect = () => rect(i * SLIDE_W - track.scrollLeft);
  track.appendChild(li);
}

/** Simulates Instagram's scroll-snap carousel: only INITIAL <li>s up front;
 * each Next click lazy-renders the incoming slide and advances the scroll
 * position; the button removes itself on the last slide (real behavior).
 * `missing` lists slide indices that never get a media element. */
function buildCarousel(opts?: { total?: number; missing?: number[] }): Fixture {
  const total = opts?.total ?? TOTAL;
  const missing = new Set(opts?.missing ?? []);
  const post = document.createElement('article');
  const track = document.createElement('ul');
  track.setAttribute('style', 'overflow-x:scroll'); // detect() needs scrollability
  Object.defineProperty(track, 'clientWidth', { value: SLIDE_W, configurable: true });
  Object.defineProperty(track, 'scrollWidth', {
    get: () => track.querySelectorAll(':scope > li').length * SLIDE_W,
    configurable: true,
  });
  track.getBoundingClientRect = () => rect(0);
  for (let i = 0; i < INITIAL; i++) attachSlide(track, i, !missing.has(i));
  const next = document.createElement('button');
  next.setAttribute('aria-label', 'Next');
  next.addEventListener('click', () => {
    const pos = Math.round(track.scrollLeft / SLIDE_W);
    if (pos >= total - 1) {
      next.remove();
      return;
    }
    const target = pos + 1;
    if (track.querySelectorAll(':scope > li').length < target + 1) {
      attachSlide(track, target, !missing.has(target)); // lazy-render incoming slide
    }
    track.scrollLeft = target * SLIDE_W; // scroll-snap advance
  });
  const prev = document.createElement('button');
  prev.setAttribute('aria-label', 'Prev');
  prev.addEventListener('click', () => {
    const pos = Math.round(track.scrollLeft / SLIDE_W);
    if (pos <= 0) return;
    track.scrollLeft = (pos - 1) * SLIDE_W;
    // Real Instagram re-renders the Next button once the user moves back.
    if (!next.isConnected) track.appendChild(next);
  });
  post.appendChild(track);
  post.appendChild(next);
  post.appendChild(prev);
  document.body.appendChild(post);
  return { post, track, next };
}

interface VirtualFixture extends Fixture {
  prev: HTMLButtonElement;
  current: () => number;
}

/** Simulates Instagram's VIRTUALIZED carousel (the v0.2.4 user regression):
 * the DOM keeps only a ±1 window of <li> slides around the active one and
 * navigation is transform-like, so scrollLeft stays 0 the whole time —
 * scroll-position math cannot address slides at all here. */
function buildVirtualCarousel(opts?: { total?: number; start?: number }): VirtualFixture {
  const total = opts?.total ?? TOTAL;
  let pos = opts?.start ?? 0;
  const post = document.createElement('article');
  const track = document.createElement('ul');
  track.setAttribute('style', 'overflow-x:auto');
  Object.defineProperty(track, 'clientWidth', { value: SLIDE_W, configurable: true });
  track.getBoundingClientRect = () => rect(0);
  const lis = new Map<number, HTMLElement>();
  const render = (): void => {
    const want = new Set<number>();
    for (let i = Math.max(0, pos - 1); i <= Math.min(total - 1, pos + 1); i++) want.add(i);
    for (const [i, li] of lis) {
      if (!want.has(i)) {
        li.remove();
        lis.delete(i);
      }
    }
    for (const i of want) {
      if (!lis.has(i)) {
        const li = makeSlide(i);
        li.getBoundingClientRect = () => rect((i - pos) * SLIDE_W);
        track.appendChild(li);
        lis.set(i, li);
      }
    }
  };
  render();
  const next = document.createElement('button');
  next.setAttribute('aria-label', 'Next');
  next.addEventListener('click', () => {
    if (pos >= total - 1) {
      next.remove();
      return;
    }
    pos += 1;
    render();
  });
  const prev = document.createElement('button');
  prev.setAttribute('aria-label', 'Prev');
  prev.addEventListener('click', () => {
    if (pos <= 0) return;
    pos -= 1;
    render();
    // Real Instagram re-renders the Next button once the user moves back.
    if (!next.isConnected) post.appendChild(next);
  });
  post.appendChild(track);
  post.appendChild(next);
  post.appendChild(prev);
  document.body.appendChild(post);
  return { post, track, next, prev, current: () => pos };
}

const fastOpts = { stepMs: 10 };

describe('CarouselAdapter.expand (progressive carousel rendering)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reproduces the bug: detect() sees only the initially rendered 3 slides', () => {
    const { post } = buildCarousel();
    const car = CarouselAdapter.detect(post);
    expect(car).not.toBeNull();
    expect(car!.count).toBe(INITIAL); // the old behavior: 3 instead of 10
  });

  it('expand() walks the Next button to the end and reports the true count', async () => {
    const { post, track } = buildCarousel();
    const exp = await CarouselAdapter.expand(post, track, fastOpts);
    expect(exp.walked).toBe(true);
    expect(exp.count).toBe(TOTAL);
    expect(exp.slideEls.length).toBe(TOTAL);
    expect(exp.slideEls.every((el) => el !== null && el.isConnected)).toBe(true);
    // Every discovered slide actually references its own media element.
    const fourth = exp.slideEls[3] as HTMLElement;
    expect(fourth.querySelector('img')?.getAttribute('src')).toContain('slide-3.jpg');
    const last = exp.slideEls[TOTAL - 1] as HTMLElement;
    expect(last.querySelector('img')?.getAttribute('src')).toContain(`slide-${TOTAL - 1}.jpg`);
    // Media candidates were frozen per slide while it was active (v0.2.4).
    expect(exp.slideMedia.length).toBe(TOTAL);
    expect(exp.slideMedia.every((m) => m.length > 0)).toBe(true);
    expect(exp.slideMedia[3][0].url).toContain('slide-3.jpg');
    expect(exp.slideMedia[TOTAL - 1][0].url).toContain(`slide-${TOTAL - 1}.jpg`);
  });

  it('expand() restores the scroll position the user was on', async () => {
    const { post, track } = buildCarousel();
    track.scrollLeft = SLIDE_W; // user sits on slide 1
    const exp = await CarouselAdapter.expand(post, track, fastOpts);
    expect(exp.count).toBe(TOTAL);
    expect(track.scrollLeft).toBe(SLIDE_W);
  });

  it('expand() without a Next button returns the plain DOM count', async () => {
    const { post, track, next } = buildCarousel();
    next.remove();
    const exp = await CarouselAdapter.expand(post, track, fastOpts);
    expect(exp.count).toBe(INITIAL);
    expect(exp.walked).toBe(true);
  });

  it('expand() stops at a disabled Next button (end-of-track signal)', async () => {
    const { post, track, next } = buildCarousel({ total: TOTAL + 40 }); // never runs out
    next.setAttribute('aria-disabled', 'true');
    const exp = await CarouselAdapter.expand(post, track, fastOpts);
    expect(exp.count).toBe(INITIAL); // could not advance -> stays at DOM count
  });

  it('expand() results are cached per track (modal flow reuses the walk)', async () => {
    const { post, track } = buildCarousel();
    const first = await CarouselAdapter.expand(post, track, fastOpts);
    const second = await CarouselAdapter.expand(post, track, fastOpts);
    expect(first.walked).toBe(true);
    expect(second.walked).toBe(false); // no second walk of the same track
    expect(second.count).toBe(first.count);
  });

  it('navButton() matches localized labels incl. Persian and skips disabled', () => {
    const { post, next } = buildCarousel();
    expect(CarouselAdapter.navButton(post, 'next')).toBe(next);
    // Persian UI label
    const p = document.createElement('article');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'بعدی');
    p.appendChild(btn);
    document.body.appendChild(p);
    expect(CarouselAdapter.navButton(p, 'next')).toBe(btn);
    expect(CarouselAdapter.navButton(p, 'prev')).toBeNull();
    // Disabled buttons are never returned (they mean end-of-track)
    next.setAttribute('disabled', '');
    expect(CarouselAdapter.navButton(post, 'next')).toBeNull();
  });

  it('activeSlideElement() picks the slide filling the viewport', () => {
    const { track } = buildCarousel();
    track.scrollLeft = 2 * SLIDE_W; // slide 2 fills the viewport
    const el = CarouselAdapter.activeSlideElement(track) as HTMLElement;
    expect(el.querySelector('img')?.getAttribute('src')).toContain('slide-2.jpg');
  });
});

describe('CarouselAdapter.expand on a VIRTUALIZED carousel (v0.2.4 user regression)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reports the true count and freezes every slide media (was: 3 slides)', async () => {
    const { post, track } = buildVirtualCarousel();
    const exp = await CarouselAdapter.expand(post, track, fastOpts);
    expect(exp.walked).toBe(true);
    expect(exp.count).toBe(TOTAL); // the old walk collapsed this to 3
    expect(exp.slideMedia.length).toBe(TOTAL);
    expect(exp.slideMedia.every((m) => m.length > 0)).toBe(true);
    for (let i = 0; i < TOTAL; i++) {
      expect(exp.slideMedia[i][0].url).toContain(`slide-${i}.jpg`);
    }
  });

  it('started mid-post it still counts ALL slides and restores the position', async () => {
    const fx = buildVirtualCarousel({ start: 2 }); // user sits on slide 2
    const exp = await CarouselAdapter.expand(fx.post, fx.track, fastOpts);
    expect(exp.count).toBe(TOTAL); // slides 0..1 were captured on the way back
    expect(exp.slideMedia[0][0].url).toContain('slide-0.jpg');
    expect(exp.slideMedia[9][0].url).toContain('slide-9.jpg');
    expect(fx.current()).toBe(2); // position restored by clicking forward
  });
});

describe('MediaResolver.resolvePost with carousel expansion', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const emptyBridge = {
    queryRegistry: async (): Promise<MediaRecord[]> => [],
  } as unknown as InstagramBridgeApi;

  // resolvePost walks with the production stepMs (300ms) — a round trip over
  // 10 slides takes ~6s, so these tests get an explicit timeout.
  it('resolves ALL slides of a 10-slide post (was: only the first 3)', async () => {
    const { post } = buildCarousel();
    const resolver = new MediaResolver(emptyBridge);
    const out = await resolver.resolvePost(post, 'all', { username: 'someone' });
    expect(out.map((s) => s.slide)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(out[6].candidates[0].url).toContain('slide-6.jpg');
  }, 30_000);

  it('resolves ALL slides of a VIRTUALIZED 10-slide post from walked media', async () => {
    // The element fallback cannot work here (only ±1 window stays in the
    // DOM), so this fails unless the walk froze per-slide media.
    const { post } = buildVirtualCarousel();
    const resolver = new MediaResolver(emptyBridge);
    const out = await resolver.resolvePost(post, 'all', { username: 'someone' });
    expect(out.map((s) => s.slide)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let i = 0; i < TOTAL; i++) {
      expect(out[i].candidates[0].url).toContain(`slide-${i}.jpg`);
    }
  }, 30_000);

  it('fills a slide whose media never rendered from the network registry pool', async () => {
    // Slide 9 never gets an <img> (simulates unloaded/failed lazy media).
    const { post } = buildCarousel({ missing: [TOTAL - 1] });
    const bridge = {
      queryRegistry: async () => [
        { url: 'https://cdninstagram.com/post-123/slide-9.mp4', mimeType: 'video/mp4', ts: Date.now() },
      ],
    } as unknown as InstagramBridgeApi;
    const resolver = new MediaResolver(bridge);
    const out = await resolver.resolvePost(post, 'all', { username: 'someone' });
    expect(out.map((s) => s.slide)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const last = out.find((s) => s.slide === TOTAL - 1)!;
    expect(last.candidates[0].url).toContain('slide-9.mp4');
    expect(last.candidates[0].mediaType).toBe('video');
  }, 30_000);

  it('mode "current" still resolves only the active slide', async () => {
    const { post, track } = buildCarousel();
    track.scrollLeft = 2 * SLIDE_W; // user on slide 2 (geometry picks it)
    const resolver = new MediaResolver(emptyBridge);
    const out = await resolver.resolvePost(post, 'current', { username: 'someone' });
    expect(out.length).toBe(1);
    expect(out[0].candidates.length).toBeGreaterThan(0);
    expect(out[0].candidates[0].url).toContain('slide-2.jpg');
  });
});
