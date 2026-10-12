// Small, dependency-free, atomically-written JSON store (electron-store style:
// tmp file + rename). Used for settings, the download queue metadata and the
// history — all persisted under the app's userData directory.
import fs from 'node:fs';
import path from 'node:path';

export class JsonStore<T extends object> {
  private data: T;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private file: string,
    defaults: T,
    private debounceMs = 300,
  ) {
    this.data = this.load(defaults);
  }

  private load(defaults: T): T {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...defaults, ...(parsed as T) };
      }
    } catch {
      // First run or corrupted file -> defaults.
    }
    return { ...defaults };
  }

  get(): T {
    return this.data;
  }

  set(mutator: (draft: T) => void): void {
    mutator(this.data);
    this.schedule();
  }

  schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
  }

  /** Synchronous atomic write (tmp + rename). Safe to call on app quit. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('[store] write failed:', this.file, e);
    }
  }
}
