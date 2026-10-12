// Preload for the application renderer.
// Exposes a minimal, typed, validated API as `window.instagramApp` (spec §41).
// No direct access to ipcRenderer / fs / process / shell is ever exposed.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/channels';
import type {
  AppSettings,
  AppSettingsPatch,
  AppVersions,
  DownloadRequestPayload,
  HistoryEntry,
  InstagramAppApi,
  JobsSnapshot,
  LayoutInfo,
} from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler as never);
  return () => ipcRenderer.off(channel, handler as never);
}

const api: InstagramAppApi = {
  window: {
    minimize: () => ipcRenderer.send(IPC.WinMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.WinToggleMaximize),
    close: () => ipcRenderer.send(IPC.WinClose),
    onMaximized: (cb) => subscribe(IPC.EvtMaximized, cb as never),
  },
  view: {
    navigate: (action) => ipcRenderer.send(IPC.ViewNavigate, action),
    openExternal: () => ipcRenderer.send(IPC.ViewOpenExternal),
    onNavState: (cb) => subscribe(IPC.EvtNavState, cb as never),
    updateLayout: (layout: LayoutInfo) => ipcRenderer.send(IPC.LayoutUpdate, layout),
    forwardShortcut: (combo: string) => {
      if (typeof combo === 'string' && combo.length > 0 && combo.length <= 64) {
        ipcRenderer.send(IPC.ViewForwardShortcut, combo);
      }
    },
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.SettingsGet) as Promise<AppSettings>,
    update: (patch: AppSettingsPatch) => ipcRenderer.invoke(IPC.SettingsUpdate, patch) as Promise<AppSettings>,
    chooseDownloadRoot: () => ipcRenderer.invoke(IPC.SettingsChooseRoot) as Promise<string | null>,
  },
  download: {
    create: (payload: DownloadRequestPayload) =>
      ipcRenderer.invoke(IPC.DlCreate, payload) as Promise<{ queued: number; skipped: number }>,
    list: () => ipcRenderer.invoke(IPC.DlList) as Promise<JobsSnapshot>,
    pause: (id) => ipcRenderer.invoke(IPC.DlPause, id) as Promise<void>,
    resume: (id) => ipcRenderer.invoke(IPC.DlResume, id) as Promise<void>,
    cancel: (id) => ipcRenderer.invoke(IPC.DlCancel, id) as Promise<void>,
    retry: (id) => ipcRenderer.invoke(IPC.DlRetry, id) as Promise<void>,
    remove: (id) => ipcRenderer.invoke(IPC.DlRemove, id) as Promise<void>,
    retryAllFailed: () => ipcRenderer.invoke(IPC.DlRetryAllFailed) as Promise<void>,
    clearCompleted: () => ipcRenderer.invoke(IPC.DlClearCompleted) as Promise<void>,
    clearFailed: () => ipcRenderer.invoke(IPC.DlClearFailed) as Promise<void>,
    pauseAll: () => ipcRenderer.invoke(IPC.DlPauseAll) as Promise<void>,
    resumeAll: () => ipcRenderer.invoke(IPC.DlResumeAll) as Promise<void>,
    reorder: (id, direction) => ipcRenderer.invoke(IPC.DlReorder, { id, direction }) as Promise<void>,
    openFile: (id) => ipcRenderer.invoke(IPC.DlOpenFile, id) as Promise<void>,
    openFolder: (id) => ipcRenderer.invoke(IPC.DlOpenFolder, id) as Promise<void>,
  },
  history: {
    list: () => ipcRenderer.invoke(IPC.HistoryList) as Promise<HistoryEntry[]>,
    clear: () => ipcRenderer.invoke(IPC.HistoryClear) as Promise<void>,
  },
  files: {
    openFolder: (path) => ipcRenderer.invoke(IPC.FilesOpenFolder, path) as Promise<void>,
  },
  app: {
    versions: () => ipcRenderer.invoke(IPC.AppVersions) as Promise<AppVersions>,
  },
  events: {
    onJobs: (cb) => subscribe(IPC.EvtJobs, cb as never),
    onStats: (cb) => subscribe(IPC.EvtStats, cb as never),
    onToast: (cb) => subscribe(IPC.EvtToast, cb as never),
    onSettingsChanged: (cb) => subscribe(IPC.EvtSettingsChanged, cb as never),
    onShowPage: (cb) => subscribe(IPC.EvtShowPage, cb as never),
  },
};

contextBridge.exposeInMainWorld('instagramApp', api);
