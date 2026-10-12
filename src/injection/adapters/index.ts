// InstagramAdapter family (spec §46). Every DOM interaction with Instagram is
// implemented here; nothing else in the codebase queries Instagram's DOM
// directly. Hover tracking implements the single-active HoverContext rule
// (spec §18).
import { InstagramSelectors, LIKE_WORDS, UNLIKE_WORDS, hasLabel } from './selectors';

// ---------------------------------------------------------------- LikeAdapter

export class LikeAdapter {
  /** Finds the real Instagram like button inside the given root. */
  static findLikeButton(root: Element): HTMLElement | null {
    const clickables = root.querySelectorAll<HTMLElement>(InstagramSelectors.clickables);
    for (const el of clickables) {
      if (!el.querySelector('svg') && el.tagName !== 'svg') continue; // like is an icon button
      if (hasLabel(el, LIKE_WORDS) || hasLabel(el, UNLIKE_WORDS)) return el;
    }
    for (const el of clickables) {
      const svg = el.querySelector('svg[aria-label]');
      if (svg && (hasLabel(svg, LIKE_WORDS) || hasLabel(svg, UNLIKE_WORDS))) return el;
    }
    return null;
  }

  /**
   * Liked-state detection. A heart counts as liked ONLY when the icon is
   * genuinely painted with a color fill (or the a11y label says "Unlike").
   *
   * Bug fix: the previous heuristic treated `svg[fill="currentColor"]` as
   * liked — but Instagram's UNLIKED outline hearts (story viewer, reels,
   * several surfaces) carry exactly that attribute and draw the shape with
   * `path fill="none" stroke="currentColor"`, so hollow hearts were reported
   * as "already liked" and the L shortcut did nothing.
   */
  static isLiked(button: HTMLElement): boolean {
    const label = labelOfSafe(button);
    if (UNLIKE_WORDS.some((w) => label.includes(w))) return true;
    const svg = button.querySelector('svg');
    if (svg) {
      const l = (svg.getAttribute('aria-label') ?? '').toLowerCase();
      if (UNLIKE_WORDS.some((w) => l.includes(w))) return true;
    }
    if (button.getAttribute('aria-pressed') === 'true') return true;
    if (!svg) return false;
    const RED = /rgb\(255,\s*48,\s*64\)|rgb\(237,\s*73,\s*86\)|rgb\(245,\s*15,\s*95\)|#ff3040|#ed4956|#f50f5f/i;
    const svgFill = svg.getAttribute('fill') ?? '';
    if (RED.test(svgFill)) return true;
    // Painted icon = some path carries a real color fill (not "none", not the
    // inherited currentColor) or a red stroke. Outline hearts have
    // path fill="none" (+ optional currentColor stroke) and stay unliked.
    const paths = Array.from(svg.querySelectorAll('path'));
    return paths.some((p) => {
      const f = (p.getAttribute('fill') ?? '').toLowerCase();
      if (f && f !== 'none' && f !== 'currentcolor') return true;
      const s = p.getAttribute('stroke') ?? '';
      return RED.test(s);
    });
  }

  /** Clicks the genuine like button. Returns what happened (spec §16). */
  static toggleLike(root: Element): 'liked' | 'already' | 'not-found' {
    const btn = LikeAdapter.findLikeButton(root);
    if (!btn) return 'not-found';
    if (LikeAdapter.isLiked(btn)) return 'already';
    (btn as HTMLElement).click();
    return 'liked';
  }
}

function labelOfSafe(el: Element | null): string {
  return (el?.getAttribute('aria-label') ?? '').toLowerCase();
}

// ---------------------------------------------------------------- PostAdapter

const NON_USERNAME_PATHS = new Set([
  'p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'stories', 'about', 'developer', 'legal', 'challenge',
]);

export class PostAdapter {
  static root(el: Element): HTMLElement | null {
    return el.closest<HTMLElement>(InstagramSelectors.article);
  }

  static username(post: Element): string | null {
    const links = post.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
    for (const a of links) {
      const href = a.getAttribute('href') ?? '';
      const m = href.match(/^\/([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/);
      if (!m) continue;
      if (NON_USERNAME_PATHS.has(m[1].toLowerCase())) continue;
      return m[1];
    }
    const img = post.querySelector('img[alt]');
    const alt = img?.getAttribute('alt') ?? '';
    const m2 = alt.match(/(?:by|of)\s+@?([A-Za-z0-9._]{1,30})/i);
    return m2 ? m2[1] : null;
  }

  static postId(post: Element): string | null {
    const a = post.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
    const href = a?.getAttribute('href') ?? '';
    const m = href.match(/\/(?:p|reel|tv)\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  /** The action bar containing the like/comment/share buttons (spec §13).
   * Returns the icon ROW (not the like button's own wrapper) so that the
   * download button lands BESIDE Like/Comment/Share instead of stacking
   * vertically underneath the like icon (bug fix). */
  static actionBar(post: Element): HTMLElement | null {
    const like = LikeAdapter.findLikeButton(post);
    if (like) {
      let node: Element = like;
      for (let depth = 0; depth < 3; depth++) {
        const candidate = node.parentElement as HTMLElement | null;
        if (!candidate || candidate === post) break;
        const iconButtons = candidate.querySelectorAll('button svg, [role="button"] svg');
        // A real action row holds several icon buttons and no images
        // (the header row contains the avatar <img>).
        if (iconButtons.length >= 2 && !candidate.querySelector('img')) return candidate;
        node = candidate;
      }
      return like.parentElement as HTMLElement | null;
    }
    // Fallback: a row holding several icon buttons directly under the media.
    const rows = post.querySelectorAll<HTMLElement>('div');
    for (const row of rows) {
      const iconButtons = row.querySelectorAll(':scope [role="button"] svg, :scope button svg');
      if (iconButtons.length >= 2 && row.querySelector('svg') && !row.querySelector('img')) {
        return row;
      }
    }
    return null;
  }

  /**
   * Nearest ancestor of `target` that behaves like a post/reel container:
   * it holds a like button and a sizeable media element. Works for feed
   * articles, post modals, Reels items and single-post pages (bug fix:
   * hover/shortcuts used to be limited to <article> elements).
   */
  static containerOf(target: Element): HTMLElement | null {
    const article = target.closest<HTMLElement>(InstagramSelectors.article);
    if (article) return article;
    let node: Element | null = target;
    for (let depth = 0; depth < 12 && node && node !== document.body; depth++) {
      node = node.parentElement;
      if (!node || node === document.documentElement) return null;
      if (node.querySelector(InstagramSelectors.article)) continue; // real posts use the article branch
      const media = node.querySelector('img, video');
      if (!media) continue;
      if (!LikeAdapter.findLikeButton(node)) continue;
      const rect = media.getBoundingClientRect();
      if (rect.width < 140 && rect.height < 140) continue; // avatar-sized
      return node as HTMLElement;
    }
    return null;
  }

  static isCarousel(post: Element): boolean {
    return CarouselAdapter.detect(post) !== null;
  }
}

// ------------------------------------------------------------- CarouselAdapter

export interface CarouselInfo {
  track: HTMLElement;
  count: number;
}

export interface CarouselExpansion {
  /** Total number of slides discovered (DOM list may still be larger). */
  count: number;
  /** Per-index slide element references captured while walking the carousel.
   * Index i may be null when the element could not be pinned down. */
  slideEls: (Element | null)[];
  /** True when a real walk happened (false = served from cache). */
  walked: boolean;
}

export class CarouselAdapter {
  static detect(post: Element): CarouselInfo | null {
    const lists = post.querySelectorAll<HTMLElement>(InstagramSelectors.carouselList);
    for (const ul of lists) {
      const slides = ul.querySelectorAll(InstagramSelectors.carouselSlide);
      if (slides.length < 2) continue;
      if (!ul.querySelector('img, video')) continue;
      const style = getComputedStyle(ul);
      const scrollable = ul.scrollWidth > ul.clientWidth + 20 || style.overflowX === 'scroll' || style.overflowX === 'auto';
      if (scrollable) return { track: ul, count: slides.length };
    }
    // Fallback: presence of prev/next navigation buttons with an a11y name.
    const hasNav = CarouselAdapter.navButton(post, 'next') !== null || CarouselAdapter.navButton(post, 'prev') !== null;
    if (hasNav) {
      const ul = post.querySelector<HTMLElement>(InstagramSelectors.carouselList);
      if (ul) {
        const count = Math.max(2, ul.querySelectorAll(InstagramSelectors.carouselSlide).length);
        return { track: ul, count };
      }
    }
    return null;
  }

  static slides(track: HTMLElement): Element[] {
    return Array.from(track.querySelectorAll(InstagramSelectors.carouselSlide));
  }

  /** Current slide index derived from scroll position (scroll-snap carousel). */
  static currentIndex(track: HTMLElement): number {
    const slides = CarouselAdapter.slides(track);
    if (!slides.length) return 0;
    if (track.scrollWidth <= track.clientWidth + 2) return 0;
    const idx = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    return Math.min(slides.length - 1, Math.max(0, idx));
  }

  static slideAt(track: HTMLElement, index: number): Element | null {
    return CarouselAdapter.slides(track)[index] ?? null;
  }

  /**
   * Finds the carousel's real prev/next navigation button. Instagram renders
   * these with a localized aria-label ("Next", "بعدی", "Siguiente", ...).
   * Disabled buttons are skipped (they signal the end of the track).
   */
  static navButton(post: Element, dir: 'next' | 'prev'): HTMLElement | null {
    const words = dir === 'next' ? InstagramSelectors.nextButtonLabels : InstagramSelectors.prevButtonLabels;
    const scopes: Element[] = [post];
    const dlg = post.closest(InstagramSelectors.dialog);
    if (dlg) scopes.push(dlg); // post-modal arrows may live outside the <article>
    for (const scope of scopes) {
      const buttons = scope.querySelectorAll<HTMLElement>('button, [role="button"]');
      for (const b of buttons) {
        if (b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true') continue;
        const l = labelOfSafe(b);
        if (!l) continue;
        if (words.some((w) => l.includes(w))) return b;
      }
    }
    return null;
  }

  // Progressive-render walk (see expand).
  private static expansions = new WeakMap<HTMLElement, CarouselExpansion>();
  private static expanding = new WeakSet<HTMLElement>();

  /**
   * Makes Instagram render EVERY slide of the carousel, then reports the true
   * slide count + per-index element references.
   *
   * Bug fix: Instagram only keeps the first ~2-3 <li> slides in the DOM and
   * lazy-loads the rest as the user swipes. A 10-slide post therefore looked
   * like a 3-slide post and "download all" fetched at most 3 items.
   *
   * The walk clicks the genuine Next button (exactly what a user does — no
   * API bypass; every slide becomes visible in the session, which the spec's
   * session-visibility rule requires) until the track ends, capturing the
   * slide element at each index, then restores the original position.
   * Cached per track element, so a second call after the modal is instant.
   */
  static async expand(
    post: HTMLElement,
    track: HTMLElement,
    opts?: { stepMs?: number; maxSlides?: number },
  ): Promise<CarouselExpansion> {
    const stepMs = opts?.stepMs ?? 300;
    const maxSlides = opts?.maxSlides ?? 100;

    const cached = CarouselAdapter.expansions.get(track);
    if (cached && cached.slideEls.length > 0 && cached.slideEls.every((el) => !el || el.isConnected)) {
      return { ...cached, walked: false };
    }
    if (CarouselAdapter.expanding.has(track)) {
      // A walk is already running on this track; wait for it instead of
      // double-clicking the same buttons from two callers.
      while (CarouselAdapter.expanding.has(track)) await delay(stepMs);
      const after = CarouselAdapter.expansions.get(track);
      if (after) return { ...after, walked: false };
    }
    CarouselAdapter.expanding.add(track);
    try {
      const originalLeft = track.scrollLeft;
      const collected = new Map<number, Element>();
      const list = () => CarouselAdapter.slides(track);
      const capture = (): void => {
        const els = list();
        if (!els.length) return;
        const idx = Math.min(CarouselAdapter.currentIndex(track), els.length - 1);
        if (idx >= 0 && els[idx]) collected.set(idx, els[idx]!);
      };
      capture();

      let guard = 0;
      while (guard++ < maxSlides + 2) {
        const next = CarouselAdapter.navButton(post, 'next');
        if (!next) break; // Instagram removes/disables it on the last slide
        const beforeLeft = track.scrollLeft;
        const beforeCount = list().length;
        try {
          next.click();
        } catch {
          break;
        }
        // Wait until the track actually advances or new slides render
        // (bounded ~1.5s so a stalled UI can never hang the action).
        let advanced = false;
        for (let tick = 0; tick < 5; tick++) {
          await delay(stepMs / 2);
          if (track.scrollLeft !== beforeLeft || list().length !== beforeCount) {
            advanced = true;
            break;
          }
        }
        await delay(stepMs / 2); // let the newly active slide load its media
        capture();
        if (!advanced) break; // clicked but nothing changed -> end of track
        if (list().length >= maxSlides) break;
      }

      // Put the carousel back where the user had it.
      try {
        track.scrollLeft = originalLeft;
      } catch {
        /* ignore */
      }
      await delay(Math.min(stepMs, 200));

      const els = list();
      const count = Math.max(collected.size, els.length);
      const slideEls: (Element | null)[] = [];
      for (let i = 0; i < count; i++) {
        const c = collected.get(i);
        slideEls.push(c && c.isConnected ? c : (els[i] ?? null));
      }
      const result: CarouselExpansion = { count, slideEls, walked: true };
      if (slideEls.length > 0) CarouselAdapter.expansions.set(track, result);
      return result;
    } finally {
      CarouselAdapter.expanding.delete(track);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------- StoryAdapter

export class StoryAdapter {
  /** Cached detection — the viewer is queried on every hover/keydown. */
  private static viewerCache: { el: HTMLElement | null; ts: number } | null = null;

  /**
   * Detects the full-screen story viewer. Two independent strategies:
   * 1. A dialog overlay (any [role=dialog]) that shows media + a profile
   *    link and holds no <article> (post modals do contain one).
   * 2. Fallback: a viewport-covering media overlay without dialog semantics.
   *
   * Bug fix: the old width rule (>40% of the viewport) missed the story
   * viewer, which is a tall but NARROW column on desktop — stories therefore
   * never got a download button.
   */
  static viewer(): HTMLElement | null {
    const now = Date.now();
    if (this.viewerCache && now - this.viewerCache.ts < 400) {
      const cached = this.viewerCache.el;
      if (cached && !cached.isConnected) this.viewerCache = null;
      else return cached;
    }
    const el = StoryAdapter.detectViewer();
    this.viewerCache = { el, ts: now };
    return el;
  }

  private static detectViewer(): HTMLElement | null {
    // Strategy 1: dialog-based.
    const dialogs = document.querySelectorAll<HTMLElement>(InstagramSelectors.dialog);
    for (const d of dialogs) {
      if (d.querySelector(InstagramSelectors.article)) continue;
      const hasMedia = d.querySelector('video') || d.querySelector('img');
      if (!hasMedia) continue;
      if (!d.querySelector('a[href^="/"]')) continue;
      const rect = d.getBoundingClientRect();
      // Tall overlay; may be a narrow centered column.
      const minW = Math.min(320, window.innerWidth * 0.2);
      if (rect.height > window.innerHeight * 0.45 && rect.width >= minW) return d;
    }
    // Strategy 2: viewport-covering media overlay (no dialog semantics).
    let best: HTMLElement | null = null;
    let bestArea = 0;
    const media = document.querySelectorAll('video, img');
    for (const m of media) {
      const rect = m.getBoundingClientRect();
      if (rect.height < window.innerHeight * 0.5 || rect.width < window.innerWidth * 0.25) continue;
      let host: HTMLElement | null = m.parentElement;
      while (host && host !== document.body && host !== document.documentElement) {
        if (host.querySelector(InstagramSelectors.article) || host.closest(InstagramSelectors.article)) {
          host = null;
          break;
        }
        const hr = host.getBoundingClientRect();
        if (hr.width >= window.innerWidth * 0.5 && hr.height >= window.innerHeight * 0.6) break;
        host = host.parentElement;
      }
      if (!host || host === document.body || host === document.documentElement) continue;
      if (!host.querySelector('a[href^="/"]')) continue;
      const hostRect = host.getBoundingClientRect();
      const area = hostRect.width * hostRect.height;
      if (area > bestArea) {
        bestArea = area;
        best = host;
      }
    }
    return best;
  }

  static username(dialog: Element): string | null {
    const links = dialog.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
    for (const a of links) {
      const href = a.getAttribute('href') ?? '';
      const m = href.match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
      if (!m) continue;
      if (NON_USERNAME_PATHS.has(m[1].toLowerCase())) continue;
      return m[1];
    }
    return null;
  }

  /** The slide element that is currently visible inside the story viewer. */
  static activeSlide(dialog: Element): Element | null {
    const video = dialog.querySelector('video');
    if (video) return video.closest('div') ?? dialog;
    let best: Element | null = null;
    let bestArea = 0;
    for (const img of dialog.querySelectorAll('img')) {
      const area = img.clientWidth * img.clientHeight;
      if (area > bestArea) {
        bestArea = area;
        best = img;
      }
    }
    if (best) return best.closest('div') ?? dialog;
    return dialog;
  }
}

// ------------------------------------------------------------ NavigationAdapter

export class NavigationAdapter {
  /** Re-initializes the enhancement layer after SPA navigations (spec §12). */
  static install(onNavigate: () => void): void {
    const wrap = (name: 'pushState' | 'replaceState') => {
      const original = history[name].bind(history);
      history[name] = (...args: Parameters<History['pushState']>) => {
        const result = original(...args);
        onNavigate();
        return result;
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', onNavigate);
  }
}

// ---------------------------------------------------------------- HoverTracker

export interface HoverState {
  type: 'post' | 'story';
  post?: HTMLElement;
  dialog?: HTMLElement;
}

export class HoverTracker {
  private lastTarget: Element | null = null;
  private lastX = -1;
  private lastY = -1;
  private state: HoverState | null = null;
  private resolveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Last known hover state (cheap, possibly stale). Actions should call
   * `resolveFresh()` right before acting. */
  get current(): HoverState | null {
    return this.state;
  }

  install(): void {
    document.addEventListener('mouseover', this.onMove, { capture: true, passive: true });
    document.documentElement.addEventListener('mouseleave', () => {
      this.lastTarget = null;
      this.state = null;
    });
  }

  clear(): void {
    this.lastTarget = null;
    this.state = null;
  }

  /**
   * Re-derives the hover context against the CURRENT DOM. Instagram re-renders
   * its feed constantly, so a stored <article> element can become detached —
   * deriving the container fresh (from the last hovered element, or from the
   * last mouse position) makes shortcuts reliable (bug fix).
   */
  resolveFresh(): HoverState | null {
    let target: Element | null = this.lastTarget && this.lastTarget.isConnected ? this.lastTarget : null;
    if (!target && this.lastX >= 0) {
      try {
        target = document.elementFromPoint(this.lastX, this.lastY);
      } catch {
        target = null;
      }
    }
    if (!target) return (this.state = null);
    const story = StoryAdapter.viewer();
    if (story && story.contains(target)) {
      return (this.state = { type: 'story', dialog: story });
    }
    const post = PostAdapter.containerOf(target);
    return (this.state = post ? { type: 'post', post } : null);
  }

  private onMove = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;
    this.lastTarget = target;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    // Fast path for feed articles; non-article layouts (Reels, …) are
    // resolved lazily (also at action time via resolveFresh()).
    const post = target.closest<HTMLElement>(InstagramSelectors.article);
    if (post) {
      this.state = { type: 'post', post };
      return;
    }
    if (this.resolveTimer) return;
    this.resolveTimer = setTimeout(() => {
      this.resolveTimer = null;
      this.resolveFresh();
    }, 120);
  };
}
