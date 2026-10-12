// Completed-download history: used for the History page, duplicate detection
// (spec §34) and all-time statistics.
import type { HistoryEntry } from '../../shared/types';
import { HISTORY_STORE_MAX } from '../../shared/layout';
import { JsonStore } from './JsonStore';

interface HistoryData {
  entries: HistoryEntry[];
}

export class HistoryManager {
  private store: JsonStore<HistoryData>;

  constructor(file: string) {
    this.store = new JsonStore<HistoryData>(file, { entries: [] }, 400);
  }

  add(entry: HistoryEntry): void {
    this.store.set((d) => {
      // Dedupe by job id: a restored job that replays its completion transition
      // (or any re-add of the same job) must not duplicate the history row or
      // inflate all-time bytes.
      if (d.entries.some((e) => e.id === entry.id)) return;
      d.entries.unshift(entry);
      if (d.entries.length > HISTORY_STORE_MAX) d.entries.length = HISTORY_STORE_MAX;
    });
  }

  list(): HistoryEntry[] {
    return [...this.store.get().entries];
  }

  hasUrl(url: string): boolean {
    return this.store.get().entries.some((e) => e.mediaUrl === url);
  }

  allTimeBytes(): number {
    return this.store.get().entries.reduce((acc, e) => acc + (e.bytes || 0), 0);
  }

  clear(): void {
    this.store.set((d) => {
      d.entries = [];
    });
  }

  flush(): void {
    this.store.flush();
  }
}
