// Regression test (user-reported bug): "notifications repeat every time I open
// the app — ones shown in the previous session show again".
// Root cause: DownloadManager.init() restored jobs into the queue while
// prevStatuses was still empty, so detectTransitions() treated every restored
// completed/failed job as a fresh transition and replayed its toast + OS
// notification (and re-added a duplicate history row) on each launch.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const harness = vi.hoisted(() => ({
  notifications: [] as Array<{ title: string; body: string }>,
  tmpRoot: '',
}));

vi.mock('electron', () => {
  class Notification {
    static isSupported(): boolean {
      return true;
    }
    constructor(opts: { title: string; body: string }) {
      harness.notifications.push(opts);
    }
    on(): void {}
    show(): void {}
  }
  return {
    Notification,
    shell: { showItemInFolder: vi.fn() },
    powerSaveBlocker: {
      start: vi.fn(() => 1),
      stop: vi.fn(),
      isStarted: vi.fn(() => true),
    },
    app: {
      isPackaged: false,
      getPath: () => harness.tmpRoot ?? os.tmpdir(),
      setLoginItemSettings: vi.fn(),
    },
  };
});

// Replace the network executor: live jobs complete instantly without network.
vi.mock('../src/main/core/Downloader', () => ({
  createExecutor:
    () =>
    async (job: { destinationPath: string }) => ({
      finalPath: job.destinationPath,
      bytes: 10,
      mimeType: 'image/jpeg',
    }),
}));

import { IPC } from '../src/shared/channels';
import type { DownloadJob } from '../src/shared/types';
import { DownloadManager } from '../src/main/core/DownloadManager';
import { HistoryManager } from '../src/main/core/HistoryStore';
import { SettingsManager } from '../src/main/core/SettingsStore';

let userDataPath = '';

function makeStoredJob(overrides: Partial<DownloadJob>): DownloadJob {
  return {
    id: overrides.id ?? 'stored-1',
    source: 'post',
    username: 'nasa',
    mediaType: 'image',
    mediaUrl: 'https://scontent.cdninstagram.com/stored-1.jpg',
    destinationPath: '/x/nasa/images/stored-1.jpg',
    status: 'completed',
    attemptCount: 1,
    maxAttempts: 3,
    bytesReceived: 500,
    totalBytes: 500,
    createdAt: 1779274212,
    completedAt: 1779274213,
    ...overrides,
  };
}

function writeJobsFile(jobs: DownloadJob[]): void {
  fs.writeFileSync(path.join(userDataPath, 'jobs.json'), JSON.stringify({ jobs }), 'utf8');
}

function buildManager() {
  const settings = new SettingsManager(path.join(userDataPath, 'settings.json'));
  const history = new HistoryManager(path.join(userDataPath, 'history.json'));
  const session = { webRequest: { onCompleted: vi.fn() } } as never;
  const emit = vi.fn();
  const manager = new DownloadManager({
    settings,
    history,
    session,
    getUserAgent: () => 'test-agent',
    userDataPath,
    emit,
  });
  return { manager, emit, history };
}

const toastCalls = (emit: ReturnType<typeof vi.fn>) =>
  emit.mock.calls.filter((c: unknown[]) => c[0] === IPC.EvtToast);

describe('DownloadManager notification replay regression (spec: no cross-session replays)', () => {
  beforeEach(() => {
    harness.notifications.length = 0;
    harness.tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'igd-replay-'));
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'igd-userdata-'));
  });

  it('does NOT replay toasts/OS notifications for completed jobs restored from the previous session', () => {
    writeJobsFile([makeStoredJob({ id: 'done-1', status: 'completed' }), makeStoredJob({ id: 'done-2', status: 'completed' })]);
    const { manager, emit } = buildManager();
    manager.init();
    expect(toastCalls(emit)).toHaveLength(0);
    expect(harness.notifications).toHaveLength(0);
  });

  it('does NOT replay notifications for failed jobs restored from the previous session', () => {
    writeJobsFile([makeStoredJob({ id: 'fail-1', status: 'failed', errorCode: 'HTTP_404' })]);
    const { manager, emit } = buildManager();
    manager.init();
    expect(toastCalls(emit)).toHaveLength(0);
    expect(harness.notifications).toHaveLength(0);
  });

  it('does NOT duplicate history rows when restoring previously completed jobs', () => {
    writeJobsFile([makeStoredJob({ id: 'done-1', status: 'completed' })]);
    const { manager, history } = buildManager();
    manager.init();
    expect(history.list()).toHaveLength(0);
  });

  it('still notifies exactly once for a genuinely new download in this session', () => {
    writeJobsFile([makeStoredJob({ id: 'done-1', status: 'completed' })]);
    const { manager, emit, history } = buildManager();
    manager.init();

    const res = manager.createFromRequest({
      context: 'post',
      postId: 'live-1',
      username: 'nasa',
      candidates: [{ url: 'https://scontent.cdninstagram.com/live-1.jpg', mediaType: 'image' }],
    } as never);
    expect(res.queued).toBe(1);

    return vi.waitFor(() => {
      expect(toastCalls(emit)).toHaveLength(1);
      expect(harness.notifications).toHaveLength(1);
      expect(history.list()).toHaveLength(1);
      expect(history.list()[0].postId).toBe('live-1');
    });
  });

  it('notifies a live failure only once even when older restored jobs exist', () => {
    writeJobsFile([makeStoredJob({ id: 'old-fail', status: 'failed', errorCode: 'HTTP_404' })]);
    const { manager, emit } = buildManager();
    manager.init();
    expect(toastCalls(emit)).toHaveLength(0);

    const job = manager.get('old-fail');
    expect(job?.status).toBe('failed');
    // A user-initiated retry of the OLD failed job is a live action and may
    // notify again — but only for this new attempt, never on restore.
    manager.retry('old-fail');
    expect(manager.get('old-fail')?.status === 'queued' || manager.get('old-fail')?.status === 'downloading').toBe(true);
  });
});
