// Toolbar for the embedded Instagram view: back / forward / reload / home,
// current URL, active shortcut hints and open-in-system-browser.
// The native WebContentsView renders directly below this strip (the
// placeholder underneath is only visible while the view loads).

import { ChevronLeft, ChevronRight, ExternalLink, Home, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';
import { api } from '../lib/api';
import { DEFAULT_SHORTCUTS, displayShortcut } from '../../../shared/shortcuts';

/** Toolbar strip; the native Instagram view renders right below it. */
export function InstagramPage() {
  const nav = useUiStore((s) => s.navState);
  const sc = useSettingsStore((s) => s.settings?.shortcuts ?? DEFAULT_SHORTCUTS);
  const url = nav?.url ?? 'https://www.instagram.com/';
  let label = url;
  try {
    const u = new URL(url);
    label = u.host + u.pathname;
  } catch {
    /* keep raw */
  }

  const toolBtn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-t2 transition-colors hover:bg-app hover:text-t1 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent';

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3"
        style={{ height: 44 }}
      >
        <button type="button" aria-label="Back" title="Back" className={toolBtn} disabled={!nav?.canGoBack} onClick={() => api.view.navigate('back')}>
          <ChevronLeft size={17} />
        </button>
        <button type="button" aria-label="Forward" title="Forward" className={toolBtn} disabled={!nav?.canGoForward} onClick={() => api.view.navigate('forward')}>
          <ChevronRight size={17} />
        </button>
        <button type="button" aria-label="Reload" title="Reload" className={toolBtn} onClick={() => api.view.navigate('reload')}>
          <RefreshCw size={15} />
        </button>
        <button type="button" aria-label="Home" title="Instagram home" className={toolBtn} onClick={() => api.view.navigate('home')}>
          <Home size={15} />
        </button>

        <div className="mx-2 flex min-w-0 flex-1 items-center rounded-lg bg-surface-2 px-3 py-1.5">
          <span className="truncate text-[12px] text-t2" title={url}>
            {label}
          </span>
        </div>

        <div className="hidden items-center gap-1.5 text-[10.5px] text-t4 lg:flex">
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-t2">{displayShortcut(sc.like)}</kbd>
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-t2">{displayShortcut(sc.downloadAll)}</kbd>
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-t2">{displayShortcut(sc.downloadCurrent)}</kbd>
        </div>
        <button type="button" aria-label="Open in system browser" title="Open in system browser" className={toolBtn} onClick={() => api.view.openExternal()}>
          <ExternalLink size={15} />
        </button>
      </div>

      {/* The area below the toolbar is covered by the native WebContentsView.
          This placeholder is only visible for the brief loading moment. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-app">
        <div className="igd-gradient flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl">
          <Home size={20} className="text-white" />
        </div>
        <p className="text-[12px] text-t4">Loading Instagram…</p>
      </div>
    </div>
  );
}
