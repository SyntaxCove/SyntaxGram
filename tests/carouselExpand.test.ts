/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// @vitest-environment jsdom

// Carousel expansion regression (v0.2.2): Instagram only keeps the first
// ~3 slide <li> nodes in the DOM; walking the real Next button must
// capture every slide index and restore the original scroll position.
// Carousel progressive-render regression (user report): a 10-slide post was
// detected and downloaded as 3 slides, because Instagram keeps only the first
// few <li> slides in the DOM (and lazy-loads their media) until the user
// actually swipes through the post. CarouselAdapter.expand() must walk the
// real Next button to the end so every slide exists before resolving.
import { beforeEach, describe, expect, it } from 'vitest';
import { CarouselAdapter } from '../src/injection/adapters';
import { MediaResolver } from '../src/injection/resolvers';
import type { InstagramBridgeApi, MediaRecord } from '../src/shared/types';

const INITIAL = 3; // what Instagram initially keeps in the DOM
const TOTAL = 10; // the real slide count of the post

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

/** Simulates Instagram's carousel: only INITIAL <li>s up front; each Next
 * click appends the next slide and advances the scroll position; the button
 * removes itself on the last slide (real Instagram behavior). `missing`
 * lists slide indices that never get a media element (unloaded media). */
function buildCarousel(opts?: { total?: number; missing?: number[] }): Fixture {
  const total = opts?.total ?? TOTAL;
  const missing = new Set(opts?.missing ?? []);
  const post = document.createElement('article');
  const track = document.createElement('ul');
  track.setAttribute('style', 'overflow-x:scroll'); // detect() needs scrollability
  for (let i = 0; i < INITIAL; i++) track.appendChild(makeSlide(i, !missing.has(i)));
  const next = document.createElement('button');
  next.setAttribute('aria-label', 'Next');
  next.addEventListener('click', () => {
    const count = track.querySelectorAll(':scope > li').length;
    if (count >= total) {
      next.remove();
      return;
    }
    track.appendChild(makeSlide(count, !missing.has(count)));
    track.scrollLeft = count; // scroll-snap advance (clientWidth=0 in jsdom)
  });
  post.appendChild(track);
  post.appendChild(next);
  document.body.appendChild(post);
  return { post, track, next };
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
  });

  it('expand() restores the scroll position the user was on', async () => {
    const { post, track } = buildCarousel();
    track.scrollLeft = 1; // user sits on slide 1
    const exp = await CarouselAdapter.expand(post, track, fastOpts);
    expect(exp.count).toBe(TOTAL);
    expect(track.scrollLeft).toBe(1);
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
});

describe('MediaResolver.resolvePost with carousel expansion', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const emptyBridge = {
    queryRegistry: async (): Promise<MediaRecord[]> => [],
  } as unknown as InstagramBridgeApi;

  it('resolves ALL slides of a 10-slide post (was: only the first 3)', async () => {
    const { post } = buildCarousel();
    const resolver = new MediaResolver(emptyBridge);
    const out = await resolver.resolvePost(post, 'all', { username: 'someone' });
    expect(out.map((s) => s.slide)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(out[6].candidates[0].url).toContain('slide-6.jpg');
  });

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
  });

  it('mode "current" still resolves only the active slide', async () => {
    const { post, track } = buildCarousel();
    // jsdom has no layout engine -> emulate the carousel viewport geometry
    // (real browser: scrollWidth = N * clientWidth for a slide-per-view track).
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(track, 'scrollWidth', { value: 300 * TOTAL, configurable: true });
    track.scrollLeft = 2 * 300; // user on slide 2
    const resolver = new MediaResolver(emptyBridge);
    const out = await resolver.resolvePost(post, 'current', { username: 'someone' });
    expect(out.length).toBe(1);
    expect(out[0].candidates.length).toBeGreaterThan(0);
    expect(out[0].candidates[0].url).toContain('slide-2.jpg');
  });
});
