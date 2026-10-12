// Global DownloadManager (spec §29): every download created by the UI or the
// Instagram injection layer flows through this class and nowhere else.
// Responsibilities: job creation + URL/duplicate validation, queue ownership,
// persistence, stats, native notifications, toasts and .part cleanup.
import { Notification, shell, powerSaveBlocker } from 'electron';
import type { Session } from 'electron';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  IPC,
} from '../../shared/channels';
import { JOB_STORE_MAX } from '../../shared/layout';
import type {
  DownloadCreateResult,
  DownloadJob,
  DownloadRequestPayload,
  ErrorCode,
  JobsSnapshot,
  MediaRecord,
  ToastPayload,
} from '../../shared/types';
import { isRegistryQuery } from '../../shared/validators';
import { DownloadQueue } from './DownloadQueue';
import type { Executor } from './DownloadQueue';
import { createExecutor } from './Downloader';
import { HistoryManager } from './HistoryStore';
import { JsonStore } from './JsonStore';
import { MediaRegistry, inferMediaType } from './MediaRegistry';
import { baseFileName, decideEnqueue, sanitizeUsername } from './naming';
import { extForMime } from './mime';
import { isAllowedMediaUrl } from './urlGuard';
import { resolveInsideRoot } from './pathGuard';
import { pickPerSlide } from './mediaPick';
import { SettingsManager } from './SettingsStore';

interface EmitMap {
  [IPC.EvtJobs]: DownloadJob[];
  [IPC.EvtStats]: JobsSnapshot['stats'];
  [IPC.EvtToast]: ToastPayload;
}

interface ManagerOpts {
  settings: SettingsManager;
  history: HistoryManager;
  session: Session;
  getUserAgent: () => string;
  userDataPath: string;
  emit<K extends keyof EmitMap>(channel: K, payload: EmitMap[K]): void;
}

const PART_CLEAN_ERROR_CODES = new Set<ErrorCode>([
  'HTTP_403',
  'HTTP_404',
  'HTTP_OTHER',
  'INVALID_MEDIA',
  'INVALID_RESPONSE',
  'URL_REJECTED',
  'UNSUPPORTED_MEDIA',
]);

export class DownloadManager {
  readonly registry = new MediaRegistry();
  private store: JsonStore<{ jobs: DownloadJob[] }>;
  private queue: DownloadQueue;
  private executor: Executor;
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private prevStatuses = new Map<string, DownloadJob['status']>();
  private powerBlockerId: number | null = null;

  constructor(private opts: ManagerOpts) {
    this.store = new JsonStore<{ jobs: DownloadJob[] }>(
      path.join(opts.userDataPath, 'jobs.json'),
      { jobs: [] },
      800,
    );
    this.executor = createExecutor({ session: opts.session, getUserAgent: opts.getUserAgent });
    this.registry.attach(opts.session);

    this.queue = new DownloadQueue({
      concurrency: opts.settings.get().maxConcurrentDownloads,
      execute: (job, hooks) =>
        this.executor(job, { ...hooks, duplicateBehavior: opts.settings.get().duplicateBehavior }),
      onChanged: () => this.onChanged(),
      now: () => Math.floor(Date.now() / 1000),
    });
    // Keep the pure queue aware of the duplicate behavior setting.
    this.queue.duplicateBehaviorResolver = () => opts.settings.get().duplicateBehavior;
  }

  init(): void {
    const stored = this.store.get().jobs.slice(0, JOB_STORE_MAX);
    // Seed the transition baseline BEFORE restoring: detectTransitions() fires
    // on any status not yet present in prevStatuses. Without this seed, every
    // completed/failed job restored from the previous session was treated as a
    // fresh transition and replayed its toast + OS notification on each launch,
    // and onJobCompleted() re-inserted duplicate history entries.
    for (const job of stored) this.prevStatuses.set(job.id, job.status);
    this.queue.restore(stored);
  }

  flush(): void {
    this.persistNow();
    this.opts.history.flush();
    this.opts.settings.flush();
  }

  // ---------- creation ----------

  createFromRequest(payload: DownloadRequestPayload): DownloadCreateResult {
    const settings = this.opts.settings.get();
    const username = sanitizeUsername(payload.username || 'instagram');
    const candidates =
      payload.context === 'carousel-current'
        ? payload.candidates.map((c) => ({ ...c, slideIndex: 0 }))
        : payload.candidates;
    const chosen = pickPerSlide(candidates);
    const timestampSec = Math.floor(Date.now() / 1000);
    const base = baseFileName(username, timestampSec);

    let queued = 0;
    let skipped = 0;
    const seenUrls = new Set<string>();

    for (const c of chosen) {
      if (!isAllowedMediaUrl(c.url)) {
        skipped++;
        continue;
      }
      if (seenUrls.has(c.url)) continue;
      seenUrls.add(c.url);

      if (this.isDuplicateLive(c.url)) {
        skipped++;
        continue;
      }
      if (decideEnqueue(settings.duplicateBehavior, this.opts.history.hasUrl(c.url)) === 'skip') {
        skipped++;
        continue;
      }

      const ext = extForMime(c.mimeType) ?? (c.mediaType === 'video' ? 'mp4' : 'jpg');
      const dirType = c.mediaType === 'video' ? 'videos' : 'images';
      let destinationPath: string;
      try {
        destinationPath = resolveInsideRoot(settings.downloadRoot, username, dirType, `${base}.${ext}`);
      } catch {
        skipped++;
        continue;
      }

      const job: DownloadJob = {
        id: crypto.randomUUID(),
        source: payload.context === 'story' ? 'story' : 'post',
        sourceId: payload.postId ?? payload.storyId,
        username,
        mediaType: c.mediaType,
        mediaUrl: c.url,
        mimeType: c.mimeType,
        extension: ext,
        destinationPath,
        status: 'queued',
        attemptCount: 0,
        maxAttempts: settings.maxRetryAttempts,
        bytesReceived: 0,
        totalBytes: 0,
        createdAt: timestampSec,
        slideIndex: c.slideIndex,
      };
      this.queue.add(job);
      queued++;
    }
    return { queued, skipped };
  }

  private isDuplicateLive(url: string): boolean {
    return this.queue
      .list()
      .some((j) => j.mediaUrl === url && ['queued', 'downloading', 'paused', 'completed'].includes(j.status));
  }

  registryQuery(raw: unknown): MediaRecord[] {
    if (!isRegistryQuery(raw)) return [];
    return this.registry.query(raw);
  }

  // ---------- pass-through actions ----------

  get(id: string): DownloadJob | undefined {
    return this.queue.get(id);
  }

  pause(id: string): void {
    this.queue.pause(id);
  }

  resume(id: string): void {
    this.queue.resume(id);
  }

  cancel(id: string): void {
    this.queue.cancel(id);
    void this.cleanupPart(id).catch(() => {});
  }

  retry(id: string): void {
    const job = this.queue.get(id);
    if (!job) return;
    if (job.errorCode && PART_CLEAN_ERROR_CODES.has(job.errorCode)) {
      void this.cleanupPart(id).catch(() => {});
      job.bytesReceived = 0;
    }
    this.queue.retry(id);
  }

  remove(id: string): void {
    this.queue.remove(id);
    void this.cleanupPart(id).catch(() => {});
  }

  retryAllFailed(): void {
    this.queue.retryStatuses(['failed', 'cancelled']);
  }

  clearCompleted(): void {
    this.queue.removeStatuses(['completed']);
  }

  clearFailed(): void {
    this.queue.removeStatuses(['failed', 'cancelled']);
  }

  pauseAll(): void {
    this.queue.pauseAll();
  }

  resumeAll(): void {
    this.queue.resumeAll();
  }

  reorder(id: string, direction: 'up' | 'down'): void {
    this.queue.reorder(id, direction);
  }

  setConcurrency(n: number): void {
    this.queue.setConcurrency(n);
  }

  private async cleanupPart(id: string): Promise<void> {
    const job = this.queue.get(id);
    if (!job || !job.mediaUrl) return;
    // Only clean for jobs that will not resume: failed with dead URL, cancelled, removed.
    const willResume = job.status === 'paused' || job.status === 'queued' || job.status === 'downloading';
    if (willResume) return;
    if (job.status === 'failed' && job.errorCode && !PART_CLEAN_ERROR_CODES.has(job.errorCode)) return;
    try {
      await fsp.rm(`${job.destinationPath}.part`, { force: true });
    } catch {
      /* ignore */
    }
  }

  // ---------- events / persistence ----------

  private onChanged(): void {
    this.detectTransitions();
    this.scheduleBroadcast();
    this.schedulePersist();
    this.syncPowerSaveBlocker();
  }

  private detectTransitions(): void {
    for (const job of this.queue.list()) {
      const prev = this.prevStatuses.get(job.id);
      if (prev !== job.status) {
        this.prevStatuses.set(job.id, job.status);
        if (job.status === 'completed') this.onJobCompleted(job);
        else if (job.status === 'failed') this.onJobFailed(job);
      }
    }
  }

  private onJobCompleted(job: DownloadJob): void {
    const filename = path.basename(job.destinationPath);
    this.opts.history.add({
      id: job.id,
      username: job.username,
      filename,
      path: job.destinationPath,
      mediaType: job.mediaType,
      bytes: job.bytesReceived,
      completedAt: (job.completedAt ?? Math.floor(Date.now() / 1000)) * 1000,
      mediaUrl: job.mediaUrl,
      postId: job.sourceId,
    });
    this.opts.emit(IPC.EvtToast, { kind: 'success', message: `Download complete — ${filename}` });
    this.notify('Download Complete', filename, job.destinationPath);
  }

  private onJobFailed(job: DownloadJob): void {
    const filename = path.basename(job.destinationPath);
    this.opts.emit(IPC.EvtToast, {
      kind: 'error',
      message: `Download failed — ${filename} (${job.errorCode ?? 'UNKNOWN'})`,
    });
    this.notify('Download Failed', `${filename}\n${job.errorCode ?? 'UNKNOWN'}`, undefined);
  }

  private notify(title: string, body: string, clickPath?: string): void {
    if (!this.opts.settings.get().notifications) return;
    try {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body, silent: false });
      if (clickPath) n.on('click', () => shell.showItemInFolder(clickPath));
      n.show();
    } catch (e) {
      console.error('[downloads] notification failed', e);
    }
  }

  snapshot(): JobsSnapshot {
    return {
      jobs: this.queue.list(),
      stats: this.queue.stats(this.opts.history.allTimeBytes()),
    };
  }

  private scheduleBroadcast(): void {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      const snap = this.snapshot();
      this.opts.emit(IPC.EvtJobs, snap.jobs);
      this.opts.emit(IPC.EvtStats, snap.stats);
    }, 220);
  }

  private schedulePersist(): void {
    this.store.schedule();
  }

  private persistNow(): void {
    this.store.set((d) => {
      d.jobs = this.queue.list().slice(0, JOB_STORE_MAX);
    });
    this.store.flush();
  }

  private syncPowerSaveBlocker(): void {
    const active = this.queue.getActiveCount();
    if (active > 0 && this.powerBlockerId === null) {
      this.powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    } else if (active === 0 && this.powerBlockerId !== null) {
      if (powerSaveBlocker.isStarted(this.powerBlockerId)) powerSaveBlocker.stop(this.powerBlockerId);
      this.powerBlockerId = null;
    }
  }

  /** Used by the registry query path to expose inferred media types. */
  static inferMediaType = inferMediaType;
}
