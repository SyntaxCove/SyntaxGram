// In-page UI primitives for the Instagram enhancement layer (spec §13/§14/§15).
// The icon is the official Lucide "download" glyph (consistent with the app UI;
// no hand-drawn SVGs). Styles are namespaced with `igd-` and cannot clash with
// Instagram CSS. Overlays use the app's light theme look (user request).

export const BTN_ATTR = 'data-igd';

const STYLE_ID = 'igd-style';

export function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.igd-action-btn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:40px;height:40px;cursor:pointer;opacity:.75;color:inherit;user-select:none;-webkit-user-select:none}
.igd-action-btn:hover{opacity:1;transform:scale(1.06)}
.igd-action-btn svg{width:24px;height:24px;stroke:currentColor}
/* Fixed pill for stories/reels: corner placement, does not cover content and
   does not depend on Instagram's header DOM (bug fix). */
.igd-story-pill{position:fixed;top:56px;right:18px;z-index:2147483646;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:rgba(24,24,27,.72);color:#fff;font:600 12.5px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;cursor:pointer;user-select:none;-webkit-user-select:none;backdrop-filter:blur(6px);box-shadow:0 4px 14px rgba(0,0,0,.35);transition:background .15s ease,transform .15s ease}
.igd-story-pill:hover{background:rgba(24,24,27,.9);transform:scale(1.04)}
.igd-story-pill svg{width:15px;height:15px;stroke:#fff}
.igd-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;background:rgba(255,255,255,.98);color:#27272a;border:1px solid rgba(0,0,0,.08);font:13px/1 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:10px 18px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.18);transition:opacity .25s ease;pointer-events:none}
.igd-toast[data-kind="success"]{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.igd-toast[data-kind="error"]{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
.igd-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(24,24,27,.45);display:flex;align-items:center;justify-content:center;font:14px/1.45 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.igd-modal{background:#ffffff;color:#18181b;border:1px solid rgba(0,0,0,.06);border-radius:16px;padding:22px 24px;width:360px;max-width:92vw;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.igd-modal h3{margin:0 0 6px;font-size:16px;font-weight:600}
.igd-modal p{margin:0 0 18px;color:#71717a;font-size:13px}
.igd-modal-btn{display:block;width:100%;margin:0 0 10px;padding:10px 0;border:0;border-radius:8px;background:#0095f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
.igd-modal-btn:hover{background:#1877f2}
.igd-modal-btn--text{background:transparent;color:#71717a;font-weight:400;margin-bottom:0}
.igd-modal-btn--text:hover{background:transparent;color:#18181b}
`;
  document.head.appendChild(style);
}

/** Lucide "download" icon path (official Lucide glyph, stroke-based). */
function downloadIcon(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
}

export function createActionButton(opts: {
  attr: string;
  title: string;
  className: string;
  size?: number;
}): HTMLDivElement {
  const btn = document.createElement('div');
  btn.setAttribute(BTN_ATTR, opts.attr);
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-label', opts.title);
  btn.title = opts.title;
  btn.className = opts.className;
  btn.innerHTML = downloadIcon(opts.size ?? 24);
  return btn;
}

// ---------- in-page toast (spec §14: immediate feedback) ----------

export function pageToast(message: string, kind: 'success' | 'error' | 'info' = 'info'): void {
  try {
    const el = document.createElement('div');
    el.className = 'igd-toast';
    el.setAttribute('data-kind', kind);
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 2400);
  } catch {
    /* page may be unloading */
  }
}

// ---------- carousel modal (spec §15) ----------

let activeOverlay: HTMLElement | null = null;

export function isModalOpen(): boolean {
  return activeOverlay !== null;
}

export function openCarouselModal(mediaCount: number): Promise<'current' | 'all' | 'cancel'> {
  return new Promise((resolve) => {
    if (activeOverlay) {
      activeOverlay.remove();
      activeOverlay = null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'igd-overlay';
    const modal = document.createElement('div');
    modal.className = 'igd-modal';
    modal.innerHTML = `
      <h3>Download Carousel</h3>
      <p>This post contains ${mediaCount} media.</p>
      <button class="igd-modal-btn" data-act="current">Download Current Slide</button>
      <button class="igd-modal-btn" data-act="all">Download All ${mediaCount} Slides</button>
      <button class="igd-modal-btn igd-modal-btn--text" data-act="cancel">Cancel</button>
    `;
    overlay.appendChild(modal);
    activeOverlay = overlay;

    const close = (result: 'current' | 'all' | 'cancel') => {
      overlay.remove();
      activeOverlay = null;
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') close('cancel');
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === overlay) close('cancel');
    });
    modal.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'current') close('current');
      else if (act === 'all') close('all');
      else close('cancel');
    });

    document.body.appendChild(overlay);
  });
}
