// Window Manager + WebContentsView Manager (spec §2/§3).
// - Frameless modern window with the React renderer as chrome
// - Instagram Web runs inside a dedicated, sandboxed WebContentsView
// - Persistent session partition keeps the user logged in across restarts (§4)
// - The view is positioned by layout info sent from the renderer (§5)
import { app, BrowserWindow, session, shell, webFrameMain, WebContentsView } from 'electron';
import type { Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { INSTAGRAM_URL } from '../../shared/layout';
import { IPC } from '../../shared/channels';
import { passkeySuppressorSource } from '../../shared/passkeySuppressor';
import type { LayoutInfo, NavState } from '../../shared/types';

export const MAIN_PRELOAD_PATH = path.join(__dirname, '../preload/index.js');
export const IG_PRELOAD_PATH = path.join(__dirname, '../preload/instagram.js');
const INJECTION_PATH = path.join(__dirname, '../injection/instagram.js');
const RENDERER_INDEX_PATH = path.join(__dirname, '../renderer/index.html');

const IG_URL_RE = /^https:\/\/([\w-]+\.)*(instagram\.com|cdninstagram\.com|fbcdn\.net)(\/|$|\?)/;

export class MainWindowController {
  win: BrowserWindow | null = null;
  igView: WebContentsView | null = null;
  igSession!: Session;
  userAgent = '';
  /** Built-in default UA (cleaned Chromium string); keeps working as the
   * fallback when the user resets the custom user-agent (user request). */
  defaultUserAgent = '';

  private layout: LayoutInfo = { page: 'instagram', sidebarWidth: 240, headerHeight: 48, toolbarHeight: 44 };
  private injectTimer: ReturnType<typeof setTimeout> | null = null;
  private injectionCode: string | null = null;
  private quitting = false;

  constructor(
    private opts: {
      getMinimizeToTray: () => boolean;
      getTheme?: () => 'light' | 'dark';
      getUserAgent?: () => string;
    },
  ) {}

  private initialTheme(): 'light' | 'dark' {
    return this.opts.getTheme?.() ?? 'light';
  }

  create(): void {
    // ---------- session (persistent Instagram login, spec §4) ----------
    this.igSession = session.fromPartition('persist:instagram');
    const ua = this.igSession
      .getUserAgent()
      .replace(/\s*Electron\/[\d.]+/i, '')
      .replace(/\s*InstagramDesktop\/[\d.]+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    this.defaultUserAgent = ua || this.igSession.getUserAgent();
    const custom = this.opts.getUserAgent?.().trim() ?? '';
    this.userAgent = custom.length > 0 ? custom : this.defaultUserAgent;
    this.igSession.setUserAgent(this.userAgent);
    // No permission prompts inside the embedded browser (camera/mic/notifications).
    this.igSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    // Native download interception: downloads are handled by our DownloadManager only.
    this.igSession.on('will-download', (event) => {
      event.preventDefault();
    });

    // ---------- main window ----------
    const theme = this.initialTheme();
    this.win = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 960,
      minHeight: 620,
      show: false,
      frame: false,
      backgroundColor: theme === 'dark' ? '#09090b' : '#f4f4f5',
      title: 'SyntaxGram',
      webPreferences: {
        preload: MAIN_PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    this.win.once('ready-to-show', () => {
      this.win?.show();
      // Keyboard focus belongs to the Instagram page by default so shortcuts
      // (L / D / Ctrl+D) work immediately after launch (bug fix).
      try {
        this.igView?.webContents.focus();
      } catch {
        /* view not ready */
      }
    });
    this.win.on('resize', () => this.applyBounds());
    this.win.on('maximize', () => {
      this.win?.webContents.send(IPC.EvtMaximized, true);
      this.applyBounds();
    });
    this.win.on('unmaximize', () => {
      this.win?.webContents.send(IPC.EvtMaximized, false);
      this.applyBounds();
    });
    this.win.on('close', (e) => {
      if (this.opts.getMinimizeToTray() && !this.quitting) {
        e.preventDefault();
        this.win?.hide();
      }
    });
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    if (!app.isPackaged) {
      this.win.webContents.on('before-input-event', (_e, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') this.win?.webContents.toggleDevTools();
      });
    }

    if (process.env.VITE_DEV_SERVER_URL) {
      void this.win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      void this.win.loadFile(RENDERER_INDEX_PATH);
    }

    // ---------- Instagram WebContentsView (spec §2) ----------
    this.igView = new WebContentsView({
      webPreferences: {
        preload: IG_PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: this.igSession,
        spellcheck: false,
      },
    });
    this.win.contentView.addChildView(this.igView);
    this.igView.setBackgroundColor(theme === 'dark' ? '#000000' : '#ffffff');
    this.igView.setVisible(false);

    const wc = this.igView.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      // Keep the user inside the dedicated Instagram browser when possible.
      if (IG_URL_RE.test(url)) {
        void wc.loadURL(url);
        return { action: 'deny' };
      }
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('dom-ready', () => this.scheduleInject());
    wc.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
      // Main frame: covered by the preload guard (runs before page scripts)
      // and by the injection layer. Child frames (e.g. the Meta login iframe,
      // which can issue its own WebAuthn requests) need the same guard.
      if (isMainFrame) return;
      this.injectPasskeyGuardIntoFrame(frameProcessId, frameRoutingId);
    });
    wc.on('did-navigate', () => {
      this.pushNavState();
      this.scheduleInject();
    });
    wc.on('did-navigate-in-page', () => {
      this.pushNavState();
      this.scheduleInject();
    });
    wc.on('render-process-gone', () => {
      setTimeout(() => {
        try {
          wc.reload();
        } catch {
          /* view already gone */
        }
      }, 1500);
    });
    if (!app.isPackaged) {
      wc.on('before-input-event', (_e, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') wc.toggleDevTools();
      });
    }
    void wc.loadURL(INSTAGRAM_URL).catch(() => {});
  }

  // ---------- injection (spec §12) ----------

  private scheduleInject(): void {
    if (this.injectTimer) return;
    this.injectTimer = setTimeout(() => {
      this.injectTimer = null;
      this.inject();
    }, 120);
  }

  private inject(): void {
    try {
      if (!this.injectionCode) this.injectionCode = fs.readFileSync(INJECTION_PATH, 'utf8');
      this.igView?.webContents.executeJavaScript(this.injectionCode).catch(() => {});
    } catch (e) {
      console.error('[inject] cannot read injection bundle:', INJECTION_PATH, e);
    }
  }

  /**
   * Injects the passkey guard into a CHILD frame (best effort). The frame may
   * vanish between the load event and this call, and a frame that is still
   * initializing may reject the first attempt — so run now and retry once.
   * The main-frame guard lives in preload/instagram.ts; this only covers
   * iframes whose main world is separate (v0.2.3 passkey fix).
   */
  private injectPasskeyGuardIntoFrame(processId: number, routingId: number): void {
    const run = (): void => {
      try {
        const frame = webFrameMain.fromId(processId, routingId);
        void frame?.executeJavaScript(passkeySuppressorSource()).catch(() => {});
      } catch {
        /* frame already gone */
      }
    };
    run();
    setTimeout(run, 400);
  }

  // ---------- layout / bounds ----------

  applyBounds(): void {
    if (!this.win || !this.igView) return;
    const [w, h] = this.win.getContentSize();
    const { page, sidebarWidth, headerHeight, toolbarHeight } = this.layout;
    if (page === 'instagram') {
      this.igView.setBounds({
        x: Math.round(sidebarWidth),
        y: Math.round(headerHeight + toolbarHeight),
        width: Math.max(1, Math.round(w - sidebarWidth)),
        height: Math.max(1, Math.round(h - headerHeight - toolbarHeight)),
      });
      this.igView.setVisible(true);
    } else {
      this.igView.setVisible(false);
    }
  }

  setLayout(layout: LayoutInfo): void {
    const previousPage = this.layout.page;
    this.layout = layout;
    this.applyBounds();
    // When the user navigates the app shell back to the Instagram page, move
    // keyboard focus to the view so shortcuts keep working without an extra
    // click inside the page (bug fix).
    if (layout.page === 'instagram' && previousPage !== 'instagram') {
      try {
        this.igView?.webContents.focus();
      } catch {
        /* view gone */
      }
    }
  }

  /** Apply theme side effects: window + Instagram view background. */
  applyTheme(theme: 'light' | 'dark'): void {
    try {
      this.win?.setBackgroundColor(theme === 'dark' ? '#09090b' : '#f4f4f5');
      this.igView?.setBackgroundColor(theme === 'dark' ? '#000000' : '#ffffff');
    } catch {
      /* window may be gone */
    }
  }

  /**
   * Applies a custom user agent (Settings → User agent). An empty string
   * restores the built-in default. Takes effect after a view reload, which is
   * triggered automatically. Returns true when something changed.
   */
  applyUserAgent(custom: string | undefined): boolean {
    const next = (custom ?? '').trim();
    const ua = next.length > 0 ? next : this.defaultUserAgent;
    if (ua === this.userAgent) return false;
    this.userAgent = ua;
    try {
      this.igSession.setUserAgent(ua);
    } catch {
      /* session gone */
    }
    try {
      void this.igView?.webContents.reload();
    } catch {
      /* view gone */
    }
    return true;
  }

  // ---------- navigation (spec §3) ----------

  pushNavState(): void {
    if (!this.win || !this.igView) return;
    const wc = this.igView.webContents;
    const state: NavState = {
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      url: wc.getURL(),
    };
    this.win.webContents.send(IPC.EvtNavState, state);
  }

  navigate(action: 'back' | 'forward' | 'reload' | 'home'): void {
    if (!this.igView) return;
    const wc = this.igView.webContents;
    const nav = wc.navigationHistory;
    if (action === 'back' && nav.canGoBack()) nav.goBack();
    else if (action === 'forward' && nav.canGoForward()) nav.goForward();
    else if (action === 'reload') void wc.reload();
    else if (action === 'home') void wc.loadURL(INSTAGRAM_URL).catch(() => {});
    this.pushNavState();
  }

  openExternal(): void {
    const url = this.igView?.webContents.getURL();
    if (url?.startsWith('https://')) void shell.openExternal(url);
  }

  // ---------- window state ----------

  showPage(page: string): void {
    if (!this.win) return;
    if (this.win.isMinimized()) this.win.restore();
    this.win.show();
    this.win.focus();
    this.win.webContents.send(IPC.EvtShowPage, page);
  }

  minimize(): void {
    this.win?.minimize();
  }

  toggleMaximize(): void {
    if (!this.win) return;
    if (this.win.isMaximized()) this.win.unmaximize();
    else this.win.maximize();
  }

  closeWindow(): void {
    this.win?.close();
  }

  markQuitting(): void {
    this.quitting = true;
  }
}
