// Centralized IPC channel names (single source of truth for main/preload/renderer).
export const IPC = {
  // window controls
  WinMinimize: 'win:minimize',
  WinToggleMaximize: 'win:toggle-maximize',
  WinClose: 'win:close',
  EvtMaximized: 'evt:maximized',

  // instagram view controls
  ViewNavigate: 'view:navigate',
  ViewOpenExternal: 'view:open-external',
  EvtNavState: 'evt:nav-state',
  EvtShowPage: 'evt:show-page',
  /** Renderer -> main: forward a shortcut combo to the Instagram view. Covers
   * the case where keyboard focus is on the app shell (not the view) while the
   * mouse hovers a post inside the view (fixes "shortcuts do not work"). */
  ViewForwardShortcut: 'view:forward-shortcut',

  // layout sync (renderer measures, main positions the WebContentsView)
  LayoutUpdate: 'layout:update',

  // settings
  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',
  SettingsChooseRoot: 'settings:choose-root',
  EvtSettingsChanged: 'evt:settings-changed',

  // downloads
  DlCreate: 'dl:create',
  DlList: 'dl:list',
  DlPause: 'dl:pause',
  DlResume: 'dl:resume',
  DlCancel: 'dl:cancel',
  DlRetry: 'dl:retry',
  DlRemove: 'dl:remove',
  DlRetryAllFailed: 'dl:retry-all-failed',
  DlClearCompleted: 'dl:clear-completed',
  DlClearFailed: 'dl:clear-failed',
  DlPauseAll: 'dl:pause-all',
  DlResumeAll: 'dl:resume-all',
  DlReorder: 'dl:reorder',
  DlOpenFile: 'dl:open-file',
  DlOpenFolder: 'dl:open-folder',
  EvtJobs: 'evt:jobs',
  EvtStats: 'evt:stats',
  EvtToast: 'evt:toast',

  // history
  HistoryList: 'history:list',
  HistoryClear: 'history:clear',

  // files
  FilesOpenFolder: 'files:open-folder',

  // instagram bridge (WebContentsView preload <-> main)
  IgDownloadRequest: 'ig:download-request',
  IgRegistryQuery: 'ig:registry-query',
  IgToast: 'ig:toast',
  IgReady: 'ig:ready',
  EvtIgSettings: 'evt:ig-settings',

  // app meta
  AppVersions: 'app:versions',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
