// ---------------------------------------------------------------------------
// Shared, typed contract between Main / Preload / Renderer / Injection layers.
// ---------------------------------------------------------------------------

// ---------- Media ----------
export type MediaType = 'image' | 'video';
export type MediaSourceKind = 'dom' | 'metadata' | 'resource' | 'network';

/** A media URL candidate discovered by the MediaResolver chain. */
export interface MediaCandidate {
  url: string;
  mediaType: MediaType;
  source: MediaSourceKind;
  width?: number;
  height?: number;
  mimeType?: string;
  /** Carousel slide index (0-based). Defaults to 0 for single media. */
  slideIndex?: number;
}

export type DownloadContextKind = 'post-single' | 'carousel-current' | 'carousel-all' | 'story';

/** Payload sent from the injected Instagram layer to the DownloadManager. */
export interface DownloadRequestPayload {
  context: DownloadContextKind;
  username: string;
  postId?: string;
  storyId?: string;
  currentIndex: number;
  candidates: MediaCandidate[];
}

export interface DownloadCreateResult {
  queued: number;
  skipped: number;
}

/** A media URL observed on the network layer of the Instagram session. */
export interface MediaRecord {
  url: string;
  mimeType?: string;
  bytes?: number;
  ts: number;
}

export interface RegistryQuery {
  mediaType?: MediaType;
  limit?: number;
  sinceMs?: number;
}

// ---------- Hover context (spec §18) ----------
export interface HoverContext {
  type: 'post' | 'story';
  postId?: string;
  storyId?: string;
  username: string;
  media: MediaCandidate[];
  currentIndex: number;
}

// ---------- Downloads ----------
export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type DownloadSource = 'post' | 'story';

export type ErrorCode =
  | 'NETWORK_TIMEOUT'
  | 'CONNECTION_RESET'
  | 'CONNECTION_LOST'
  | 'DNS_ERROR'
  | 'HTTP_403'
  | 'HTTP_404'
  | 'HTTP_429'
  | 'HTTP_OTHER'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_MEDIA'
  | 'UNSUPPORTED_MEDIA'
  | 'DISK_FULL'
  | 'PERMISSION_DENIED'
  | 'PATH_ERROR'
  | 'URL_REJECTED'
  | 'CANCELLED'
  | 'DUPLICATE_SKIPPED'
  | 'UNKNOWN';

/** Core download job (spec §22, plus a few additive fields). */
export interface DownloadJob {
  id: string;
  source: DownloadSource;
  sourceId?: string;
  username: string;
  mediaType: MediaType;
  mediaUrl?: string;
  mimeType?: string;
  extension?: string;
  destinationPath: string;
  status: DownloadStatus;
  attemptCount: number;
  maxAttempts: number;
  bytesReceived: number;
  totalBytes: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  errorCode?: ErrorCode;
  /** Transient (not meaningful after restart). Bytes/second. */
  speedBps?: number;
  slideIndex?: number;
}

export interface HistoryEntry {
  id: string;
  username: string;
  filename: string;
  path: string;
  mediaType: MediaType;
  bytes: number;
  completedAt: number;
  mediaUrl?: string;
  postId?: string;
}

export interface QueueStats {
  active: number;
  queued: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalSpeedBps: number;
  sessionBytes: number;
  allTimeBytes: number;
}

export interface JobsSnapshot {
  jobs: DownloadJob[];
  stats: QueueStats;
}

// ---------- Settings (spec §37) ----------
export interface ShortcutConfig {
  like: string;
  downloadAll: string;
  downloadCurrent: string;
}

export interface AppSettings {
  downloadRoot: string;
  maxConcurrentDownloads: number;
  maxRetryAttempts: number;
  duplicateBehavior: 'unique' | 'overwrite' | 'skip';
  notifications: boolean;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  /** UI theme. Light is the default look (user request). */
  theme: 'light' | 'dark';
  shortcuts: ShortcutConfig;
  /** Custom User-Agent for the embedded Instagram session.
   * Empty string = built-in default (cleaned Chromium UA) is preserved. */
  userAgent: string;
}

export type AppSettingsPatch = Partial<AppSettings>;

// ---------- Layout / Nav / Misc ----------
export interface LayoutInfo {
  page: string;
  sidebarWidth: number;
  headerHeight: number;
  toolbarHeight: number;
}

export interface NavState {
  canGoBack: boolean;
  canGoForward: boolean;
  url: string;
}

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastPayload {
  kind: ToastKind;
  message: string;
}

export interface AppVersions {
  app: string;
  electron: string;
  chrome: string;
  node: string;
}

export type Unsubscribe = () => void;

// ---------- Preload API for the app renderer (spec §41) ----------
export interface InstagramAppApi {
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    onMaximized(cb: (maximized: boolean) => void): Unsubscribe;
  };
  view: {
    navigate(action: 'back' | 'forward' | 'reload' | 'home'): void;
    openExternal(): void;
    onNavState(cb: (state: NavState) => void): Unsubscribe;
    updateLayout(layout: LayoutInfo): void;
    /** Forward a normalized shortcut combo (e.g. "ctrl+d") to the Instagram
     * view when the shell holds keyboard focus. No-op for invalid combos. */
    forwardShortcut(combo: string): void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: AppSettingsPatch): Promise<AppSettings>;
    chooseDownloadRoot(): Promise<string | null>;
  };
  download: {
    create(payload: DownloadRequestPayload): Promise<DownloadCreateResult>;
    list(): Promise<JobsSnapshot>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
    retry(id: string): Promise<void>;
    remove(id: string): Promise<void>;
    retryAllFailed(): Promise<void>;
    clearCompleted(): Promise<void>;
    clearFailed(): Promise<void>;
    pauseAll(): Promise<void>;
    resumeAll(): Promise<void>;
    reorder(id: string, direction: 'up' | 'down'): Promise<void>;
    openFile(id: string): Promise<void>;
    openFolder(id?: string): Promise<void>;
  };
  history: {
    list(): Promise<HistoryEntry[]>;
    clear(): Promise<void>;
  };
  files: {
    openFolder(path?: string): Promise<void>;
  };
  app: {
    versions(): Promise<AppVersions>;
  };
  events: {
    onJobs(cb: (jobs: DownloadJob[]) => void): Unsubscribe;
    onStats(cb: (stats: QueueStats) => void): Unsubscribe;
    onToast(cb: (toast: ToastPayload) => void): Unsubscribe;
    onSettingsChanged(cb: (settings: AppSettings) => void): Unsubscribe;
    onShowPage(cb: (page: string) => void): Unsubscribe;
  };
}

// ---------- Preload bridge for the injected Instagram enhancement layer ----------
export interface InstagramBridgeApi {
  requestDownload(payload: DownloadRequestPayload): Promise<DownloadCreateResult>;
  queryRegistry(query: RegistryQuery): Promise<MediaRecord[]>;
  toast(message: string, kind?: ToastKind): void;
  ready(): void;
  onSettings(cb: (settings: AppSettings) => void): void;
}
