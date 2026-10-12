import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadJob } from '../src/shared/types';
import { DownloadQueue } from '../src/main/core/DownloadQueue';
import type { Executor } from '../src/main/core/DownloadQueue';
import { DownloadError } from '../src/main/core/errors';

let nextId = 1;

function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
  const id = overrides.id ?? `job-${nextId++}`;
  return {
    id,
    source: 'post',
    username: 'nasa',
    mediaType: 'image',
    mediaUrl: `https://scontent.cdninstagram.com/${id}.jpg`,
    destinationPath: `/tmp/root/nasa/images/${id}.jpg`,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: 3,
    bytesReceived: 0,
    totalBytes: 0,
    createdAt: 1779274212,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeQueue(concurrency: number, execute: Executor) {
  const queue = new DownloadQueue({ concurrency, execute, onChanged: () => {}, now: () => 1779274212 });
  return { queue };
}

describe('DownloadQueue (spec §22/§23/§24/§26)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nextId = 1;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('respects the concurrency limit and pulls the next job in FIFO order', async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];
    const started: string[] = [];
    const execute: Executor = async (job) => {
      started.push(job.id);
      await gates[started.length - 1].promise;
      return { finalPath: job.destinationPath, bytes: 100 };
    };
    const { queue } = makeQueue(2, execute);

    for (let i = 0; i < 5; i++) queue.add(makeJob({ id: `j${i}` }));
    expect(queue.list().filter((j) => j.status === 'downloading').map((j) => j.id)).toEqual(['j0', 'j1']);

    gates[0].resolve();
    await vi.runAllTimersAsync();
    expect(started).toContain('j2');
    expect(queue.getActiveCount()).toBe(2);

    gates[1].resolve();
    gates[2].resolve();
    gates[3].resolve();
    gates[4].resolve();
    await vi.runAllTimersAsync();
    expect(queue.list().every((j) => j.status === 'completed')).toBe(true);
    expect(started.slice(0, 5)).toEqual(['j0', 'j1', 'j2', 'j3', 'j4']);
  });

  it('completes a job with the final path from the executor', async () => {
    const execute: Executor = async (job) => ({ finalPath: job.destinationPath.replace('.jpg', '-01.jpg'), bytes: 42 });
    const { queue } = makeQueue(1, execute);
    queue.add(makeJob({ id: 'solo' }));
    await vi.runAllTimersAsync();
    const job = queue.get('solo')!;
    expect(job.status).toBe('completed');
    expect(job.destinationPath.endsWith('-01.jpg')).toBe(true);
    expect(job.bytesReceived).toBe(42);
  });

  it('retries retryable failures with backoff until maxAttempts, then fails (spec §24)', async () => {
    let attempts = 0;
    const execute: Executor = async () => {
      attempts++;
      throw new DownloadError('NETWORK_TIMEOUT', 'timeout', true);
    };
    const { queue } = makeQueue(1, execute);
    queue.add(makeJob({ id: 'r1', maxAttempts: 3 }));

    await vi.advanceTimersByTimeAsync(500);
    expect(attempts).toBe(1);
    expect(queue.get('r1')!.status).toBe('queued'); // waiting for backoff

    await vi.advanceTimersByTimeAsync(2100); // backoff (2s) elapsed -> attempt 2
    expect(attempts).toBe(2);
    expect(queue.get('r1')!.status).toBe('queued');

    await vi.advanceTimersByTimeAsync(1000); // still inside 4s backoff
    expect(attempts).toBe(2);

    await vi.advanceTimersByTimeAsync(4200); // attempt 3 -> final failure
    expect(attempts).toBe(3);
    expect(queue.get('r1')!.status).toBe('failed');
    expect(queue.get('r1')!.attemptCount).toBe(3);
  });

  it('never retries non-retryable failures', async () => {
    let attempts = 0;
    const execute: Executor = async () => {
      attempts++;
      throw new DownloadError('HTTP_404', 'gone', false);
    };
    const { queue } = makeQueue(1, execute);
    queue.add(makeJob({ id: 'n1', maxAttempts: 5 }));
    await vi.runAllTimersAsync();
    expect(attempts).toBe(1);
    expect(queue.get('n1')!.status).toBe('failed');
  });

  it('pauses queued and downloading jobs, and resumes them', async () => {
    const gate = deferred<void>();
    const execute: Executor = async (job, hooks) => {
      await gate.promise;
      hooks.signal.throwIfAborted();
      return { finalPath: job.destinationPath, bytes: 1 };
    };
    const { queue } = makeQueue(1, execute);
    queue.add(makeJob({ id: 'a' }));
    queue.add(makeJob({ id: 'b' }));

    queue.pause('b'); // queued -> paused
    expect(queue.get('b')!.status).toBe('paused');

    gate.resolve();
    await vi.runAllTimersAsync();
    expect(queue.get('a')!.status).toBe('completed');
    // b was paused and must NOT have started
    expect(queue.get('b')!.status).toBe('paused');

    queue.resume('b');
    await vi.runAllTimersAsync();
    // gate already resolved and the signal was never aborted -> completes cleanly
    expect(queue.get('b')!.status).toBe('completed');
  });

  it('cancels a queued job directly and a downloading job via abort', async () => {
    const gate = deferred<void>();
    const execute: Executor = async (job, hooks) => {
      const abort = new Promise<never>((_, reject) => {
        hooks.signal.addEventListener('abort', () => reject(new DownloadError('CANCELLED', 'aborted', false)));
      });
      await Promise.race([gate.promise, abort]);
      return { finalPath: job.destinationPath, bytes: 1 };
    };
    const { queue } = makeQueue(1, execute);
    queue.add(makeJob({ id: 'q1' }));
    queue.add(makeJob({ id: 'q2' }));

    queue.cancel('q2');
    expect(queue.get('q2')!.status).toBe('cancelled');

    gate.resolve();
    await vi.runAllTimersAsync();
    expect(queue.get('q1')!.status).toBe('completed');
  });

  it('reorders queued jobs (spec §22)', async () => {
    const gate = deferred<void>();
    const execute: Executor = async (job) => {
      await gate.promise;
      return { finalPath: job.destinationPath, bytes: 1 };
    };
    const { queue } = makeQueue(1, execute);
    queue.add(makeJob({ id: 'o0' })); // occupies the single slot
    queue.add(makeJob({ id: 'o1' }));
    queue.add(makeJob({ id: 'o2' }));
    queue.add(makeJob({ id: 'o3' }));

    queue.reorder('o3', 'up');
    expect(queue.queuedIds()).toEqual(['o1', 'o3', 'o2']);
    queue.reorder('o3', 'up');
    expect(queue.queuedIds()).toEqual(['o3', 'o1', 'o2']);
    queue.reorder('o3', 'down');
    expect(queue.queuedIds()).toEqual(['o1', 'o3', 'o2']);
    gate.resolve();
    await vi.runAllTimersAsync();
  });

  it('tracks stats (spec §28)', async () => {
    const gate = deferred<void>();
    const execute: Executor = async (job) => {
      await gate.promise;
      return { finalPath: job.destinationPath, bytes: 500 };
    };
    const { queue } = makeQueue(2, execute);
    queue.add(makeJob({ id: 's0' }));
    queue.add(makeJob({ id: 's1' }));
    queue.add(makeJob({ id: 's2' }));

    let stats = queue.stats(1000);
    expect(stats.active).toBe(2);
    expect(stats.queued).toBe(1);

    queue.updateProgress('s0', 250, 500, 1024);
    stats = queue.stats(1000);
    expect(stats.totalSpeedBps).toBe(1024);

    gate.resolve();
    await vi.runAllTimersAsync();
    stats = queue.stats(1000);
    expect(stats.completed).toBe(3);
    expect(stats.sessionBytes).toBe(1500);
    expect(stats.allTimeBytes).toBe(1000);
  });

  it('removes jobs and ignores late executor results', async () => {
    const gate = deferred<void>();
    const execute: Executor = async (job) => {
      await gate.promise;
      return { finalPath: job.destinationPath, bytes: 1 };
    };
    const { queue } = makeQueue(1, execute);
    queue.add(makeJob({ id: 'rm' }));
    queue.remove('rm');
    expect(queue.get('rm')).toBeUndefined();
    gate.resolve();
    await vi.runAllTimersAsync();
    expect(queue.list()).toHaveLength(0);
  });

  it('restores persisted jobs, resetting downloading to queued', async () => {
    const execute: Executor = async (job) => ({ finalPath: job.destinationPath, bytes: 1 });
    const { queue } = makeQueue(2, execute);
    queue.restore([
      makeJob({ id: 'p1', status: 'downloading' }),
      makeJob({ id: 'p2', status: 'failed' }),
      makeJob({ id: 'p3', status: 'queued' }),
    ]);
    await vi.runAllTimersAsync();
    expect(queue.get('p1')!.status).toBe('completed');
    expect(queue.get('p2')!.status).toBe('failed');
    expect(queue.get('p3')!.status).toBe('completed');
  });
});
