// Regression test (user-reported bug): notifications + history rows replayed on
// every app launch. HistoryManager.add must dedupe by job id so a restored job
// re-firing its completion transition cannot duplicate history entries or
// inflate all-time bytes.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HistoryEntry } from '../src/shared/types';
import { HistoryManager } from '../src/main/core/HistoryStore';

let file = '';

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: overrides.id ?? 'job-1',
    username: 'nasa',
    filename: 'nasa-1779274212.jpg',
    path: '/root/nasa/images/nasa-1779274212.jpg',
    mediaType: 'image',
    bytes: 1234,
    completedAt: 1779274212000,
    mediaUrl: 'https://scontent.cdninstagram.com/job-1.jpg',
    ...overrides,
  };
}

describe('HistoryManager dedupe (notification replay regression)', () => {
  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'igd-hist-')), 'history.json');
  });

  it('ignores a re-add of the same job id instead of duplicating the row', () => {
    const history = new HistoryManager(file);
    history.add(makeEntry());
    // Simulates the restored-job replay that used to happen on every launch.
    history.add(makeEntry());
    history.add(makeEntry());
    expect(history.list()).toHaveLength(1);
  });

  it('keeps distinct job ids as separate entries', () => {
    const history = new HistoryManager(file);
    history.add(makeEntry({ id: 'job-1' }));
    history.add(makeEntry({ id: 'job-2', filename: 'nasa-1779274213.jpg' }));
    expect(history.list()).toHaveLength(2);
    expect(history.list().map((e) => e.id).sort()).toEqual(['job-1', 'job-2']);
  });

  it('does not double-count all-time bytes for duplicated adds', () => {
    const history = new HistoryManager(file);
    history.add(makeEntry({ bytes: 500 }));
    history.add(makeEntry({ bytes: 500 }));
    expect(history.allTimeBytes()).toBe(500);
  });

  it('keeps the newest entry first when a different job is added after a duplicate add', () => {
    const history = new HistoryManager(file);
    history.add(makeEntry({ id: 'job-1' }));
    history.add(makeEntry({ id: 'job-1' }));
    history.add(makeEntry({ id: 'job-2', filename: 'nasa-2.jpg' }));
    expect(history.list()[0].id).toBe('job-2');
  });
});
