// Instagram Enhancement Layer — entry point (spec §12-§21).
// Compiled to a single IIFE and injected into the Instagram WebContentsView by
// the main process. Runs in the page's main world with NO Node.js access; it
// talks to the app exclusively through the validated `window.instagramBridge`
// (exposed by the view preload). Fully idempotent and SPA-aware.
import type { AppSettings, DownloadRequestPayload, InstagramBridgeApi, MediaCandidate } from '../shared/types';
import { comboFromEvent } from '../shared/shortcuts';
import { installPasskeySuppressor } from '../shared/passkeySuppressor';
import { MediaResolver } from './resolvers';
import {
  CarouselAdapter,
  HoverTracker,
  LikeAdapter,
  NavigationAdapter,
  PostAdapter,
  StoryAdapter,
} from './adapters';
import type { CarouselExpansion, HoverState } from './adapters';
import { BTN_ATTR, createActionButton, ensureStyle, isModalOpen, openCarouselModal, pageToast } from './ui';

(() => {
  // Neutralize WebAuthn FIRST so no passkey modal can ever pop up, even if
  // the preload-side guard was unavailable for some reason (idempotent).
  installPasskeySuppressor(window);
  if (window.__IGD__) {
    window.__IGD__.refresh();
    return;
  }
  const bridge = window.instagramBridge as InstagramBridgeApi | undefined;
  if (!bridge || typeof bridge.requestDownload !== 'function') {
    console.warn('[IGD] bridge unavailable — enhancement layer disabled');
    return;
  }
  const bridgeApi: InstagramBridgeApi = bridge;

  // ------------------------------------------------------------------ state
  let settings: AppSettings | null = null;
  bridgeApi.onSettings((s) => {
    settings = s;
  });

  ensureStyle();
  const resolver = new MediaResolver(bridgeApi);
  const hover = new HoverTracker();
  hover.install();

  // ------------------------------------------------------------- context

  interface ActionContext {
    username: string;
    postId?: string;
  }

  function contextForPost(post: HTMLElement): ActionContext {
    return {
      username: PostAdapter.username(post) ?? 'instagram',
      postId: PostAdapter.postId(post) ?? undefined,
    };
  }

  // ------------------------------------------------------------- scanning

  function ensurePostButton(post: Element): void {
    const bar = PostAdapter.actionBar(post);
    if (!bar) return;
    if (bar.querySelector(`[${BTN_ATTR}="post"]`)) return;
    const btn = createActionButton({ attr: 'post', title: 'Download', className: 'igd-action-btn', size: 24 });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void onPostButtonClicked(post as HTMLElement);
    });
    // Insert directly AFTER the like button/wrapper so the download button
    // sits NEXT TO Like/Comment/Share in the same row (bug fix: appending
    // into the like icon's own wrapper stacked it underneath the icon).
    const like = LikeAdapter.findLikeButton(bar) ?? LikeAdapter.findLikeButton(post);
    if (like && bar.contains(like)) {
      const wrapper = like.parentElement;
      const anchor = wrapper && wrapper !== bar && bar.contains(wrapper) ? wrapper : like;
      anchor.insertAdjacentElement('afterend', btn);
    } else {
      bar.appendChild(btn);
    }
  }

  /** Fixed corner pill shown while a story/reel viewer is open (bug fix:
   * stories had no download button — the viewer is a narrow column and the
   * old header-based insertion failed). */
  function ensureStoryButton(): void {
    const story = StoryAdapter.viewer();
    if (!story) {
      removeStoryButton();
      return;
    }
    if (document.body.querySelector(`[${BTN_ATTR}="story"]`)) return;
    const pill = createActionButton({ attr: 'story', title: 'Download story', className: 'igd-story-pill', size: 15 });
    const label = document.createElement('span');
    label.textContent = 'Download';
    pill.appendChild(label);
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void downloadStory();
    });
    document.body.appendChild(pill);
  }

  function removeStoryButton(): void {
    document.body.querySelector(`[${BTN_ATTR}="story"]`)?.remove();
  }

  function scan(): void {
    try {
      for (const post of document.querySelectorAll('article')) ensurePostButton(post);
      ensureStoryButton();
    } catch {
      /* transient DOM states — ignore */
    }
  }

  const scheduleScan = debounce(scan, 180);
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  NavigationAdapter.install(() => {
    hover.clear();
    scheduleScan();
  });
  scan();

  function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
    let t: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn(...args);
      }, ms);
    };
  }

  // ------------------------------------------------------------- actions

  function toastResult(queued: number, skipped: number): void {
    if (queued > 0) pageToast(`Added ${queued} item${queued > 1 ? 's' : ''} to download queue`, 'success');
    else if (skipped > 0) pageToast('Already in queue or downloaded', 'info');
    else pageToast('No downloadable media found', 'error');
  }

  async function sendDownload(payload: DownloadRequestPayload): Promise<void> {
    try {
      const result = await bridgeApi.requestDownload(payload);
      toastResult(result.queued, result.skipped);
    } catch {
      pageToast('Could not start download', 'error');
    }
  }

  async function downloadPost(
    post: HTMLElement,
    mode: 'all' | 'current',
    expanded?: CarouselExpansion,
  ): Promise<void> {
    if (!post.isConnected) return;
    const ctx = contextForPost(post);
    const car = CarouselAdapter.detect(post);
    const currentIndex = car ? CarouselAdapter.currentIndex(car.track) : 0;

    if (mode === 'current') {
      // Geometry-based pick: stays correct on virtualized/transform carousels
      // where scroll-position math can select the wrong <li>.
      const slide = car
        ? (CarouselAdapter.activeSlideElement(car.track) ?? CarouselAdapter.slideAt(car.track, currentIndex))
        : post;
      const candidates = await resolver.resolveSlide(slide, ctx);
      if (!candidates.length) {
        pageToast('No downloadable media found', 'error');
        return;
      }
      await sendDownload({
        context: 'carousel-current',
        username: ctx.username,
        postId: ctx.postId,
        currentIndex,
        candidates: candidates.map((c) => ({ ...c, slideIndex: currentIndex })),
      });
      return;
    }

    // `expanded` comes from the modal flow (walked once there already);
    // the D-key shortcut path passes none and resolvePost walks itself.
    const perSlide = await resolver.resolvePost(post, 'all', ctx, expanded);
    const candidates: MediaCandidate[] = perSlide.flatMap((ps) =>
      ps.candidates.map((c) => ({ ...c, slideIndex: ps.slide })),
    );
    if (!candidates.length) {
      pageToast('No downloadable media found', 'error');
      return;
    }
    await sendDownload({
      context: 'carousel-all',
      username: ctx.username,
      postId: ctx.postId,
      currentIndex,
      candidates,
    });
  }

  async function downloadStory(): Promise<void> {
    const dialog = StoryAdapter.viewer();
    if (!dialog) return;
    const username = StoryAdapter.username(dialog) ?? 'instagram';
    const slide = StoryAdapter.activeSlide(dialog);
    const candidates = await resolver.resolveSlide(slide, { username });
    if (!candidates.length) {
      pageToast('No downloadable media found', 'error');
      return;
    }
    await sendDownload({
      context: 'story',
      username,
      storyId: `${username}-${Math.floor(Date.now() / 1000)}`,
      currentIndex: 0,
      candidates,
    });
  }

  async function onPostButtonClicked(post: HTMLElement): Promise<void> {
    const car = CarouselAdapter.detect(post);
    if (car) {
      // Carousel + button click -> decision modal (spec §15).
      // Walk the carousel FIRST (bug fix: Instagram renders only the first
      // few <li> slides until the user swipes — the modal used to offer and
      // download just 3 slides on a 10-slide post). The walk also collects a
      // reliable element per slide, which "download all" reuses; after it the
      // original scroll position is restored, so "current" stays correct.
      const exp = await CarouselAdapter.expand(post, car.track);
      const count = Math.max(exp.count, CarouselAdapter.slides(car.track).length);
      const choice = await openCarouselModal(count);
      if (choice === 'cancel') return;
      await downloadPost(post, choice === 'all' ? 'all' : 'current', choice === 'all' ? exp : undefined);
      return;
    }
    // Single media + button click -> immediate download, no modal (spec §14).
    await downloadPost(post, 'current');
  }

  function likeActive(h: HoverState): void {
    if (h.type === 'post' && h.post) {
      const result = LikeAdapter.toggleLike(h.post);
      if (result === 'liked') pageToast('Liked', 'success');
      else if (result === 'already') pageToast('Already liked', 'info');
      else pageToast('Like button not found — hover the post and try again', 'error');
      return;
    }
    if (h.type === 'story' && h.dialog) {
      const result = LikeAdapter.toggleLike(h.dialog);
      if (result === 'liked') pageToast('Story liked', 'success');
      else if (result === 'already') pageToast('Story already liked', 'info');
      else pageToast('Like button not found for this story', 'error');
    }
  }

  // ------------------------------------------------------------- keyboard

  /** Keyboard safety rules (spec §17): never act inside editable targets. */
  function isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if ((target as HTMLElement).isContentEditable) return true;
    if (target.closest('[contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]')) return true;
    return false;
  }

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (isModalOpen()) return; // the modal owns the keyboard while open
      if (e.isComposing || e.repeat) return;
      if (isEditable(e.target)) return;

      // Derive the hover context against the CURRENT DOM (Instagram re-renders
      // its feed constantly — a stored element would silently swallow the
      // shortcut; bug fix).
      const h = hover.resolveFresh();
      if (!h) return; // shortcuts only act inside a valid media context

      // Shortcuts come from Settings (normalized by the main process) and
      // update live — no reload needed (user request: remappable shortcuts).
      const sc = settings?.shortcuts;
      const pressed = comboFromEvent(e);
      if (!pressed) return;

      if (pressed === (sc?.downloadCurrent ?? 'ctrl+d')) {
        e.preventDefault();
        e.stopPropagation();
        if (h.type === 'story') void downloadStory();
        else void downloadPost(h.post!, 'current');
        return;
      }
      if (pressed === (sc?.downloadAll ?? 'd')) {
        e.preventDefault();
        e.stopPropagation();
        // D on a carousel downloads ALL slides directly — no modal (spec §16).
        if (h.type === 'story') void downloadStory();
        else void downloadPost(h.post!, 'all');
        return;
      }
      if (pressed === (sc?.like ?? 'l')) {
        e.preventDefault();
        e.stopPropagation();
        likeActive(h);
      }
    },
    true,
  );

  // ------------------------------------------------------------- ready
  bridgeApi.ready();
  window.__IGD__ = {
    refresh: () => scan(),
  };
})();
