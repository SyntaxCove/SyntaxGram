// App shell: page switching, theming, shortcut relay, layout sync.
// - Renders TitleBar + Sidebar + the active page (ui store holds the page id).
// - Toggles the `dark` class on <html> to switch the Tailwind theme.
// - Relays configured shortcuts to the Instagram view when keyboard focus is
//   on the shell while the mouse hovers a post inside the view, and never
//   while the user is typing in any editable element.
// - One-time bootstrap: initial store loads + main-process event
//   subscriptions (jobs, stats, toasts, settings, nav state).
// - Reports shell geometry to the main process so the native
//   WebContentsView is positioned or hidden correctly (updateLayout).

import { useEffect } from 'react';
import { HEADER_H, SIDEBAR_W, SIDEBAR_W_COLLAPSED, TOOLBAR_H } from '../../shared/layout';
import { comboFromEvent } from '../../shared/shortcuts';
import { useDownloadsStore } from './stores/downloads';
import { useSettingsStore } from './stores/settings';
import { useToastStore } from './stores/toasts';
import { useUiStore } from './stores/ui';
import { api } from './lib/api';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { Toasts } from './components/Toasts';
import { DashboardPage } from './pages/DashboardPage';
import { InstagramPage } from './pages/InstagramPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { QueuePage } from './pages/QueuePage';
import { FailedPage } from './pages/FailedPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import type { PageId } from './stores/ui';

function renderPage(page: PageId) {
  switch (page) {
    case 'dashboard':
      return <DashboardPage />;
    case 'instagram':
      return <InstagramPage />;
    case 'downloads':
      return <DownloadsPage />;
    case 'queue':
      return <QueuePage />;
    case 'failed':
      return <FailedPage />;
    case 'history':
      return <HistoryPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

export default function App() {
  const page = useUiStore((s) => s.page);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const theme = useSettingsStore((s) => s.settings?.theme ?? 'light');
  const shortcuts = useSettingsStore((s) => s.settings?.shortcuts);

  useEffect(() => {
    // Theme switch: light is the default, `.dark` on <html> flips all tokens.
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    // Shortcut forwarding: when keyboard focus is on the app shell (not the
    // Instagram view) while the user hovers a post inside the view, configured
    // shortcuts are relayed to the view so they keep working (bug fix).
    if (page !== 'instagram' || !shortcuts) return;
    const isEditableTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof Element)) return false;
      const tag = t.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (t as HTMLElement).isContentEditable === true ||
        t.closest('[contenteditable="true"], [role="textbox"], [role="searchbox"]') !== null
      );
    };
    const handler = (e: KeyboardEvent): void => {
      if (e.isComposing || e.repeat) return;
      if (isEditableTarget(e.target)) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      if (combo === shortcuts.like || combo === shortcuts.downloadAll || combo === shortcuts.downloadCurrent) {
        e.preventDefault();
        e.stopPropagation();
        api.view.forwardShortcut(combo);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [page, shortcuts]);

  useEffect(() => {
    // One-time bootstrap: initial data load + event subscriptions.
    void useDownloadsStore.getState().load();
    void useSettingsStore.getState().load();

    const offs = [
      api.events.onJobs((jobs) => useDownloadsStore.getState().setJobs(jobs)),
      api.events.onStats((stats) => useDownloadsStore.getState().setStats(stats)),
      api.events.onToast((toast) => useToastStore.getState().push(toast.kind, toast.message)),
      api.events.onSettingsChanged((settings) => useSettingsStore.getState().set(settings)),
      api.events.onShowPage((target) => useUiStore.getState().setPage(target as PageId)),
      api.window.onMaximized((maximized) => useUiStore.getState().setMaximized(maximized)),
      api.view.onNavState((state) => useUiStore.getState().setNavState(state)),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    // Layout sync: main positions/hides the native Instagram view accordingly.
    const send = () =>
      api.view.updateLayout({
        page,
        sidebarWidth: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W,
        headerHeight: HEADER_H,
        toolbarHeight: TOOLBAR_H,
      });
    send();
    window.addEventListener('resize', send);
    return () => window.removeEventListener('resize', send);
  }, [page, collapsed]);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1">{renderPage(page)}</main>
      </div>
      <Toasts />
    </div>
  );
}
