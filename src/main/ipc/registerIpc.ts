// IPC Layer (spec §41/§42): one typed, validated handler per channel.
// - Renderer channels only accept messages from the app window webContents
// - Instagram bridge channels only accept messages from the Instagram view
// - Every payload is validated with shared validators before use
import { dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import { IPC } from '../../shared/channels';
import { normalizeShortcut } from '../../shared/shortcuts';
import {
  isDownloadRequestPayload,
  isJobId,
  isLayoutInfo,
  isNavAction,
  isPlainObject,
  isToastPayload,
} from '../../shared/validators';
import type { DownloadManager } from '../core/DownloadManager';
import { HistoryManager } from '../core/HistoryStore';
import { isInsideRoot } from '../core/pathGuard';
import { SettingsManager } from '../core/SettingsStore';
import type { MainWindowController } from '../app/MainWindow';

export interface IpcDeps {
  controller: MainWindowController;
  settings: SettingsManager;
  downloads: DownloadManager;
  history: HistoryManager;
}

export function registerIpc(deps: IpcDeps): void {
  const { controller, settings, downloads, history } = deps;

  const winWc = () => controller.win?.webContents;
  const isFromView = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    !!controller.igView && e.sender === controller.igView.webContents;

  // ---------- app meta ----------
  ipcMain.handle(IPC.AppVersions, () => ({
    app: process.env.npm_package_version ?? '0.1.0',
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
  }));

  // ---------- window controls ----------
  ipcMain.on(IPC.WinMinimize, () => controller.minimize());
  ipcMain.on(IPC.WinToggleMaximize, () => controller.toggleMaximize());
  ipcMain.on(IPC.WinClose, () => controller.closeWindow());

  // ---------- instagram view controls ----------
  ipcMain.on(IPC.ViewNavigate, (e, action) => {
    if (!isFromView(e) && e.sender !== winWc()) return;
    if (isNavAction(action)) controller.navigate(action);
  });
  ipcMain.on(IPC.ViewOpenExternal, (e) => {
    if (e.sender !== winWc()) return;
    controller.openExternal();
  });
  // Keyboard focus may sit on the app shell while the mouse hovers a post
  // inside the Instagram view. Forward configured shortcut combos so they keep
  // working without requiring a click inside the page (bug fix).
  ipcMain.on(IPC.ViewForwardShortcut, (e, combo) => {
    if (e.sender !== winWc()) return;
    const normalized = normalizeShortcut(combo);
    if (!normalized) return;
    const event = comboToInputEvent(normalized);
    if (event) controller.igView?.webContents.sendInputEvent(event);
  });
  ipcMain.on(IPC.LayoutUpdate, (e, layout) => {
    if (e.sender !== winWc()) return;
    if (isLayoutInfo(layout)) controller.setLayout(layout);
  });

  // ---------- settings ----------
  ipcMain.handle(IPC.SettingsGet, (e) => {
    if (e.sender !== winWc()) return settings.get();
    return settings.get();
  });
  ipcMain.handle(IPC.SettingsUpdate, (e, patch) => {
    if (e.sender !== winWc()) return settings.get();
    // May throw (e.g. shortcut conflict) so the renderer sees a real error.
    const updated = settings.update(patch);
    if (updated.maxConcurrentDownloads) downloads.setConcurrency(updated.maxConcurrentDownloads);
    controller.applyTheme(updated.theme);
    controller.applyUserAgent(updated.userAgent);
    controller.igView?.webContents.send(IPC.EvtIgSettings, updated);
    winWc()?.send(IPC.EvtSettingsChanged, updated);
    return updated;
  });
  ipcMain.handle(IPC.SettingsChooseRoot, async (e) => {
    if (e.sender !== winWc() || !controller.win) return null;
    const result = await dialog.showOpenDialog(controller.win, {
      title: 'Choose Download Folder',
      defaultPath: settings.get().downloadRoot,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const chosen = result.filePaths[0];
    try {
      const st = fs.statSync(chosen);
      fs.accessSync(chosen, fs.constants.W_OK);
      if (!st.isDirectory()) return null;
    } catch {
      return null;
    }
    return chosen;
  });

  // ---------- downloads ----------
  ipcMain.handle(IPC.DlCreate, (e, payload) => {
    // Both the renderer (relay) and the Instagram view (bridge) may create jobs.
    if (!isDownloadRequestPayload(payload)) return { queued: 0, skipped: 0 };
    return downloads.createFromRequest(payload);
  });
  ipcMain.handle(IPC.DlList, (e) => {
    if (e.sender !== winWc()) return downloads.snapshot();
    return downloads.snapshot();
  });
  const withId = (fn: (id: string) => void) => (e: Electron.IpcMainInvokeEvent, id: unknown) => {
    if (e.sender !== winWc()) return;
    if (isJobId(id)) fn(id);
  };
  ipcMain.handle(IPC.DlPause, withId((id) => downloads.pause(id)));
  ipcMain.handle(IPC.DlResume, withId((id) => downloads.resume(id)));
  ipcMain.handle(IPC.DlCancel, withId((id) => downloads.cancel(id)));
  ipcMain.handle(IPC.DlRetry, withId((id) => downloads.retry(id)));
  ipcMain.handle(IPC.DlRemove, withId((id) => downloads.remove(id)));
  ipcMain.handle(IPC.DlRetryAllFailed, (e) => {
    if (e.sender !== winWc()) return;
    downloads.retryAllFailed();
  });
  ipcMain.handle(IPC.DlClearCompleted, (e) => {
    if (e.sender !== winWc()) return;
    downloads.clearCompleted();
  });
  ipcMain.handle(IPC.DlClearFailed, (e) => {
    if (e.sender !== winWc()) return;
    downloads.clearFailed();
  });
  ipcMain.handle(IPC.DlPauseAll, (e) => {
    if (e.sender !== winWc()) return;
    downloads.pauseAll();
  });
  ipcMain.handle(IPC.DlResumeAll, (e) => {
    if (e.sender !== winWc()) return;
    downloads.resumeAll();
  });
  ipcMain.handle(IPC.DlReorder, (e, payload) => {
    if (e.sender !== winWc()) return;
    if (!isPlainObject(payload)) return;
    const { id, direction } = payload as { id?: unknown; direction?: unknown };
    if (isJobId(id) && (direction === 'up' || direction === 'down')) downloads.reorder(id, direction);
  });
  ipcMain.handle(IPC.DlOpenFile, withId(async (id) => {
    const job = downloads.get(id);
    if (!job) return;
    try {
      await shell.openPath(job.destinationPath);
    } catch {
      /* ignore */
    }
  }));
  ipcMain.handle(IPC.DlOpenFolder, withId((id) => {
    const job = downloads.get(id);
    if (!job) return;
    shell.showItemInFolder(job.destinationPath);
  }));

  // ---------- history ----------
  ipcMain.handle(IPC.HistoryList, () => history.list());
  ipcMain.handle(IPC.HistoryClear, (e) => {
    if (e.sender !== winWc()) return;
    history.clear();
  });

  // ---------- files (spec §41: window.instagramApp.files.openFolder) ----------
  ipcMain.handle(IPC.FilesOpenFolder, (e, targetPath) => {
    if (e.sender !== winWc()) return;
    if (typeof targetPath !== 'string' || targetPath.length === 0) {
      void shell.openPath(settings.get().downloadRoot);
      return;
    }
    // Path traversal is blocked: only folders inside the Download Root (§45).
    if (isInsideRoot(settings.get().downloadRoot, targetPath) && fs.existsSync(targetPath)) {
      void shell.openPath(targetPath);
    }
  });

  // ---------- instagram bridge (view-only channels, spec §43) ----------
  ipcMain.handle(IPC.IgDownloadRequest, (e, payload) => {
    if (!isFromView(e)) return { queued: 0, skipped: 0 };
    if (!isDownloadRequestPayload(payload)) return { queued: 0, skipped: 0 };
    return downloads.createFromRequest(payload);
  });
  ipcMain.handle(IPC.IgRegistryQuery, (e, query) => {
    if (!isFromView(e)) return [];
    return downloads.registryQuery(query);
  });
  ipcMain.on(IPC.IgToast, (e, toast) => {
    if (!isFromView(e)) return;
    if (isToastPayload(toast)) winWc()?.send(IPC.EvtToast, toast);
  });
  ipcMain.on(IPC.IgReady, (e) => {
    if (!isFromView(e)) return;
    controller.pushNavState();
    // Push the persisted settings (shortcuts, …) so the enhancement layer
    // starts with the current config without waiting for a settings change.
    controller.igView?.webContents.send(IPC.EvtIgSettings, settings.get());
  });
}

/** Maps a normalized combo ("ctrl+shift+7") to an Electron keyboard input event. */
function comboToInputEvent(normalized: string): Electron.KeyboardInputEvent | null {
  const parts = normalized.split('+');
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1];
  if (!key) return null;
  const modifiers: string[] = [];
  for (const p of parts.slice(0, -1)) {
    if (p === 'ctrl') modifiers.push('control');
    else if (p === 'meta') modifiers.push('super');
    else modifiers.push(p);
  }
  let keyCode: string;
  if (key.length === 1) {
    keyCode = key;
  } else {
    const named: Record<string, string> = {
      enter: 'Return',
      esc: 'Esc',
      space: 'Space',
      up: 'Up',
      down: 'Down',
      left: 'Left',
      right: 'Right',
      pageup: 'PageUp',
      pagedown: 'PageDown',
      home: 'Home',
      end: 'End',
      insert: 'Insert',
      delete: 'Delete',
      backspace: 'Backspace',
      tab: 'Tab',
      minus: '-',
      equal: '=',
      comma: ',',
      period: '.',
      slash: '/',
      semicolon: ';',
      quote: "'",
    };
    keyCode = named[key] ?? key.charAt(0).toUpperCase() + key.slice(1); // F2, …
  }
  return { type: 'keyDown', keyCode, modifiers } as Electron.KeyboardInputEvent;
}
