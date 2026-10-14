// MediaResolver chain (spec §10/§11). Four independent resolvers, tried in
// priority order. Detection never depends on a single fragile CSS selector;
// it uses semantic structure, media elements, accessibility labels and the
// observed network session.
import type { InstagramBridgeApi, MediaCandidate, MediaRecord } from '../shared/types';
import { DOMResolver } from './resolvers/dom';
import { MetadataResolver } from './resolvers/metadata';
import { NetworkResourceResolver, ResourceResolver } from './resolvers/network';
import type { CarouselExpansion } from './adapters';

export interface ResolveContext {
  username: string;
  postId?: string;
}

export interface SlideResolution {
  slide: number;
  candidates: MediaCandidate[];
}

export class MediaResolver {
  constructor(private bridge: InstagramBridgeApi) {}

  /** Resolve media for one logical slide (a post root counts as one slide). */
  async resolveSlide(slide: Element | null, ctx: ResolveContext): Promise<MediaCandidate[]> {
    const dom = new DOMResolver().resolveFrom(slide);
    if (dom.length) return dom;
    const meta = await new MetadataResolver().resolve(ctx);
    if (meta.length) return meta;
    const res = new ResourceResolver().resolve(ctx);
    if (res.length) return res;
    return new NetworkResourceResolver().resolve(ctx, this.bridge);
  }

  /**
   * Resolve every slide of a post (carousel-aware).
   *
   * Bug fix (v0.2.2): Instagram keeps only the first few <li> slides in the
   * DOM and lazy-loads the rest while the user swipes, so a 10-slide post was
   * seen (and downloaded) as 3 slides. `CarouselAdapter.expand()` walks the
   * carousel first (clicking the real Next button, session-visible only).
   *
   * Bug fix (v0.2.4, user report: "only 3 of 10 slides still download"):
   * Instagram additionally VIRTUALIZES the carousel — after the walk only a
   * small window of <li> nodes remains in the DOM, so neither the post-walk
   * DOM list nor scroll-position math can address slides 4+. The expansion
   * now freezes each slide's media candidates while that slide is actually
   * on screen (see CarouselAdapter.expand); those walked media win here, the
   * element/DOM pass is only a fallback, and the resource/network pool fills
   * whatever is still missing. Unresolvable slides are dropped — the app
   * only ever downloads media that is genuinely available in the session.
   */
  async resolvePost(
    post: Element,
    mode: 'current' | 'all',
    ctx: ResolveContext,
    expanded?: CarouselExpansion,
  ): Promise<SlideResolution[]> {
    const { CarouselAdapter } = await import('./adapters');
    const car0 = CarouselAdapter.detect(post);

    if (mode === 'current' || !car0) {
      // Geometry-based pick: stays correct on virtualized/transform carousels
      // where scroll-position math can select the wrong <li>.
      const slide = car0
        ? (CarouselAdapter.activeSlideElement(car0.track) ??
          CarouselAdapter.slideAt(car0.track, CarouselAdapter.currentIndex(car0.track)))
        : post;
      return [{ slide: 0, candidates: await this.resolveSlide(slide, ctx) }];
    }

    const exp = expanded ?? (await CarouselAdapter.expand(post as HTMLElement, car0.track));
    // Re-detect after the walk: Instagram may have re-rendered the track.
    const car = CarouselAdapter.detect(post) ?? car0;
    const list = CarouselAdapter.slides(car.track);
    const total = Math.max(exp.count, list.length);
    // Prefer the element captured while the slide was active (it definitely
    // had loaded media); fall back to the plain DOM list entry.
    const elementAt = (i: number): Element | null => {
      const c = exp.slideEls[i];
      if (c && c.isConnected) return c;
      return list[i] ?? null;
    };

    const out: SlideResolution[] = [];
    const missing: number[] = [];
    const domResolver = new DOMResolver();
    for (let i = 0; i < total; i++) {
      // Media frozen during the walk is the most reliable per-slide source:
      // it was resolved while the slide was on screen, so virtualization or
      // lazy-unloading after the walk cannot affect it.
      const walkedMedia = exp.slideMedia?.[i] ?? [];
      if (walkedMedia.length) {
        out.push({ slide: i, candidates: walkedMedia });
        continue;
      }
      const dom = domResolver.resolveFrom(elementAt(i));
      if (dom.length) out.push({ slide: i, candidates: dom });
      else missing.push(i);
    }
    if (missing.length) {
      const res = new ResourceResolver().resolve(ctx);
      const net = await new NetworkResourceResolver().resolve(ctx, this.bridge);
      const seen = new Set(out.flatMap((s) => s.candidates.map((c) => c.url)));
      const pool = [...res, ...net].filter((c) => !seen.has(c.url));
      let i = 0;
      for (const slide of missing) {
        if (i >= pool.length) break;
        out.push({ slide, candidates: [pool[i++]] });
      }
    }
    return out.sort((a, b) => a.slide - b.slide);
  }
}

export function recordToCandidate(rec: MediaRecord): MediaCandidate {
  const isVideo = rec.mimeType?.startsWith('video/') || /\.mp4(\?|$)/i.test(rec.url);
  return {
    url: rec.url,
    mediaType: isVideo ? 'video' : 'image',
    source: 'network',
    mimeType: rec.mimeType,
  };
}

export { DOMResolver, MetadataResolver, ResourceResolver, NetworkResourceResolver };
