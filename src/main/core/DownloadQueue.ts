// Pure, testable download queue core (spec §22/§23/§26/§29).
// - FIFO scheduling with a user-configurable concurrency limit
// - Retry with per-job max attempts, only for retryable errors, with backoff
// - Pause / Resume / Cancel / Remove / Reorder / PauseAll / ResumeAll
// - Emits a single "changed" notification; persistence & UI live outside.
import type { DownloadJob, QueueStats } from '../../shared/types';
import { classifyUnknownError } from './classify';
import { DownloadError } from './errors';

export interface ExecutorHooks {
  signal: AbortSignal;
  /** Bytes already present in the .part file (resume support). */
  resumeBytes: number;
  onProgress(bytesReceived: number, totalBytes: number, speedBps: number): void;
  duplicateBehavior: 'unique' | 'overwrite' | 'skip';
}

export interface ExecutorResult {
  finalPath: string;
  bytes: number;
  mimeType?: string;
  extension?: string;
}

export type Executor = (job: DownloadJob, hooks: ExecutorHooks) => Promise<ExecutorResult>;

export interface QueueDeps {
  concurrency: number;
  execute: Executor;
  onChanged(): void;
  /** Wall clock in Unix seconds. */
  now(): number;
}

const BACKOFF_BASE_MS = 2000;
const BACKOFF_CAP_MS = 30_000;

export class DownloadQueue {
  private jobs = new Map<string, DownloadJob>();
  /** Scheduling order for queued/paused jobs (FIFO unless reordered). */
  private order: string[] = [];
  private active = new Set<string>();
  private controllers = new Map<string, AbortController>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingRetry = new Map<string, number>();
  private cancelRequested = new Set<string>();
  private sessionBytes = 0;

  constructor(private deps: QueueDeps) {}

  // ---------- lifecycle ----------

  restore(jobs: DownloadJob[]): void {
    for (const raw of jobs) {
      const job: DownloadJob = { ...raw };
      if (job.status === 'downloading') {
        // A previous session died mid-download: requeue, .part file may allow resume.
        job.status = 'queued';
        job.speedBps = 0;
        job.error = undefined;
        job.errorCode = undefined;
      }
      if (job.status === 'queued' || job.status === 'paused') this.order.push(job.id);
      this.jobs.set(job.id, job);
    }
    this.deps.onChanged();
    this.pump();
  }

  add(job: DownloadJob): void {
    this.jobs.set(job.id, job);
    this.order.push(job.id);
    this.deps.onChanged();
    this.pump();
  }

  dispose(): void {
    for (const t of this.retryTimers.values()) clearTimeout(t);
    this.retryTimers.clear();
    this.pendingRetry.clear();
    for (const c of this.controllers.values()) c.abort('cancel');
    this.controllers.clear();
  }

  // ---------- queries ----------

  get(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  list(): DownloadJob[] {
    const rank = (s: DownloadJob['status']) =>
      s === 'downloading' ? 0 : s === 'queued' ? 1 : s === 'paused' ? 2 : s === 'completed' ? 3 : s === 'failed' ? 4 : 5;
    return [...this.jobs.values()].sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt) ||
        a.createdAt - b.createdAt,
    );
  }

  /** Queued (not paused) ids in scheduling order — used by reorder UI. */
  queuedIds(): string[] {
    return this.order.filter((id) => this.jobs.get(id)?.status === 'queued');
  }

  stats(allTimeBytes: number): QueueStats {
    let active = 0;
    let queued = 0;
    let paused = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let speed = 0;
    for (const j of this.jobs.values()) {
      switch (j.status) {
        case 'downloading':
          active++;
          speed += j.speedBps ?? 0;
          break;
        case 'queued':
          queued++;
          break;
        case 'paused':
          paused++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
        case 'cancelled':
          cancelled++;
          break;
      }
    }
    return {
      active,
      queued,
      paused,
      completed,
      failed,
      cancelled,
      totalSpeedBps: speed,
      sessionBytes: this.sessionBytes,
      allTimeBytes,
    };
  }

  getActiveCount(): number {
    return this.active.size;
  }

  // ---------- scheduling ----------

  setConcurrency(n: number): void {
    this.deps.concurrency = Math.max(1, Math.min(10, Math.round(n)));
    this.pump();
  }

  get concurrency(): number {
    return this.deps.concurrency;
  }

  pump(): void {
    const now = Date.now();
    for (const [id, readyAt] of this.pendingRetry) {
      if (now >= readyAt) this.pendingRetry.delete(id);
    }
    let guard = 0;
    while (this.active.size < this.deps.concurrency && guard++ < 200) {
      const nextId = this.order.find((id) => {
        const j = this.jobs.get(id);
        return j && j.status === 'queued' && !this.pendingRetry.has(id) && !this.active.has(id);
      });
      if (!nextId) break;
      this.start(nextId);
    }
  }

  private start(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'downloading';
    if (job.startedAt == null) job.startedAt = this.deps.now();
    job.error = undefined;
    job.errorCode = undefined;
    job.speedBps = 0;
    job.attemptCount += 1;
    this.active.add(id);
    this.deps.onChanged();

    const ctrl = new AbortController();
    this.controllers.set(id, ctrl);

    this.deps
      .execute(job, {
        signal: ctrl.signal,
        resumeBytes: job.bytesReceived,
        onProgress: (bytes, total, speed) => this.updateProgress(id, bytes, total, speed),
        duplicateBehavior: this.duplicateBehaviorResolver(),
      })
      .then((res) => {
        if (this.jobs.get(id) !== job) return;
        job.status = 'completed';
        job.completedAt = this.deps.now();
        job.destinationPath = res.finalPath;
        job.bytesReceived = res.bytes;
        job.totalBytes = Math.max(job.totalBytes, res.bytes);
        if (res.mimeType) job.mimeType = res.mimeType;
        if (res.extension) job.extension = res.extension;
        job.speedBps = 0;
        this.sessionBytes += res.bytes;
        this.active.delete(id);
        this.controllers.delete(id);
        this.deps.onChanged();
        this.pump();
      })
      .catch((rawErr: unknown) => {
        if (this.jobs.get(id) !== job) return;
        this.active.delete(id);
        this.controllers.delete(id);
        this.handleFailure(job, rawErr);
        this.deps.onChanged();
        this.pump();
      });
  }

  // Injected by the manager so the pure queue stays settings-agnostic.
  duplicateBehaviorResolver: () => 'unique' | 'overwrite' | 'skip' = () => 'unique';

  private handleFailure(job: DownloadJob, rawErr: unknown): void {
    job.speedBps = 0;
    const derr = classifyUnknownError(rawErr);
    if (derr.code === 'CANCELLED') {
      if (this.cancelRequested.has(job.id)) {
        this.cancelRequested.delete(job.id);
        job.status = 'cancelled';
        job.error = 'Cancelled by user';
        job.errorCode = 'CANCELLED';
        job.completedAt = this.deps.now();
      } else {
        job.status = 'paused';
      }
      return;
    }
    job.error = derr.message;
    job.errorCode = derr.code;
    if (derr.retryable && job.attemptCount < job.maxAttempts) {
      job.status = 'queued';
      const delay = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (job.attemptCount - 1));
      this.pendingRetry.set(job.id, Date.now() + delay);
      const t = setTimeout(() => {
        this.retryTimers.delete(job.id);
        this.pendingRetry.delete(job.id);
        this.pump();
      }, delay);
      this.retryTimers.set(job.id, t);
    } else {
      job.status = 'failed';
      job.completedAt = this.deps.now();
    }
  }

  updateProgress(id: string, bytesReceived: number, totalBytes: number, speedBps: number): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'downloading') return;
    job.bytesReceived = bytesReceived;
    job.totalBytes = Math.max(job.totalBytes, totalBytes);
    job.speedBps = speedBps;
    this.deps.onChanged();
  }

  // ---------- user actions ----------

  pause(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status === 'queued') {
      job.status = 'paused';
      this.deps.onChanged();
    } else if (job.status === 'downloading') {
      this.cancelRequested.delete(id);
      this.controllers.get(id)?.abort('pause');
    }
  }

  resume(id: string): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'paused') return;
    job.status = 'queued';
    this.order = this.order.filter((x) => x !== id);
    this.order.push(id);
    this.deps.onChanged();
    this.pump();
  }

  cancel(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status === 'queued' || job.status === 'paused') {
      job.status = 'cancelled';
      job.error = 'Cancelled by user';
      job.errorCode = 'CANCELLED';
      job.completedAt = this.deps.now();
      this.deps.onChanged();
    } else if (job.status === 'downloading') {
      this.cancelRequested.add(id);
      this.controllers.get(id)?.abort('cancel');
    }
  }

  retry(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status !== 'failed' && job.status !== 'cancelled') return;
    job.status = 'queued';
    job.attemptCount = 0;
    job.bytesReceived = 0;
    job.totalBytes = 0;
    job.error = undefined;
    job.errorCode = undefined;
    job.completedAt = undefined;
    job.startedAt = undefined;
    this.order = this.order.filter((x) => x !== id);
    this.order.push(id);
    this.deps.onChanged();
    this.pump();
  }

  remove(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    if (job.status === 'downloading') {
      this.cancelRequested.add(id);
      this.controllers.get(id)?.abort('cancel');
    }
    this.jobs.delete(id);
    this.order = this.order.filter((x) => x !== id);
    this.pendingRetry.delete(id);
    const t = this.retryTimers.get(id);
    if (t) {
      clearTimeout(t);
      this.retryTimers.delete(id);
    }
    this.deps.onChanged();
    this.pump();
  }

  pauseAll(): void {
    for (const j of [...this.jobs.values()]) {
      if (j.status === 'queued' || j.status === 'downloading') this.pause(j.id);
    }
  }

  resumeAll(): void {
    for (const j of [...this.jobs.values()]) {
      if (j.status === 'paused') this.resume(j.id);
    }
  }

  /** Moves a queued job up/down within the FIFO order (spec §22). */
  reorder(id: string, direction: 'up' | 'down'): void {
    const ids = this.queuedIds();
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
    const queuedSet = new Set(ids);
    const others = this.order.filter((x) => !queuedSet.has(x));
    this.order = [...others, ...ids];
    this.deps.onChanged();
    this.pump();
  }

  // ---------- maintenance ----------

  removeStatuses(statuses: DownloadJob['status'][]): number {
    let n = 0;
    for (const j of [...this.jobs.values()]) {
      if (statuses.includes(j.status)) {
        this.remove(j.id);
        n++;
      }
    }
    return n;
  }

  retryStatuses(statuses: DownloadJob['status'][]): number {
    let n = 0;
    for (const j of [...this.jobs.values()]) {
      if (statuses.includes(j.status)) {
        this.retry(j.id);
        n++;
      }
    }
    return n;
  }

  /** The .part file of a cancelled/removed job is cleaned up by the manager. */
  static isAbortLike(e: unknown): e is DownloadError {
    return e instanceof DownloadError && e.code === 'CANCELLED';
  }
}
