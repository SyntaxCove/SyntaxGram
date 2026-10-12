// Settings manager (spec §6/§37). Persisted with JsonStore; every mutation is
// validated + clamped and applied (login item side effects).
import { app } from 'electron';
import fs from 'node:fs';
import type { AppSettings, ShortcutConfig } from '../../shared/types';
import { DEFAULT_SHORTCUTS, findShortcutConflict } from '../../shared/shortcuts';
import { sanitizeSettingsPatch } from '../../shared/validators';
import { JsonStore } from './JsonStore';

function defaultDownloadRoot(): string {
  try {
    return app.getPath('downloads');
  } catch {
    return app.getPath('home');
  }
}

function defaults(): AppSettings {
  return {
    downloadRoot: defaultDownloadRoot(),
    maxConcurrentDownloads: 3,
    maxRetryAttempts: 3,
    duplicateBehavior: 'unique',
    notifications: true,
    startWithWindows: false,
    minimizeToTray: true,
    theme: 'light', // light theme is the default (user request)
    shortcuts: { ...DEFAULT_SHORTCUTS },
    userAgent: '', // empty = built-in default user agent (user request)
  };
}

export class SettingsManager {
  private store: JsonStore<AppSettings>;

  constructor(file: string) {
    const loaded = new JsonStore<AppSettings>(file, defaults(), 200).get();
    // Normalize anything that might be missing or out of range.
    const base = defaults();
    const settings: AppSettings = {
      ...base,
      ...loaded,
      shortcuts: { ...base.shortcuts, ...(loaded.shortcuts ?? {}) },
      maxConcurrentDownloads: Math.min(10, Math.max(1, Math.round(loaded.maxConcurrentDownloads ?? 3))),
      maxRetryAttempts: Math.min(10, Math.max(1, Math.round(loaded.maxRetryAttempts ?? 3))),
      theme: loaded.theme === 'dark' ? 'dark' : 'light',
      userAgent: typeof loaded.userAgent === 'string' ? loaded.userAgent.slice(0, 512) : '',
    };
    this.store = new JsonStore<AppSettings>(file, settings, 200);
    this.store.set(() => {}); // persist normalized value
    this.ensureRoot();
    this.applySystemSideEffects();
  }

  get(): AppSettings {
    const s = this.store.get();
    return {
      ...s,
      theme: s.theme === 'dark' ? 'dark' : 'light',
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(s.shortcuts ?? {}) },
      userAgent: typeof s.userAgent === 'string' ? s.userAgent : '',
    };
  }

  update(patch: unknown): AppSettings {
    const clean = sanitizeSettingsPatch(patch);
    if (clean.downloadRoot !== undefined) {
      // Basic sanity: never allow an obviously broken root.
      if (clean.downloadRoot.trim().length === 0) delete clean.downloadRoot;
    }
    if (clean.shortcuts) {
      // Merge per-action into the current config, then reject conflicts.
      const merged: ShortcutConfig = { ...this.get().shortcuts, ...clean.shortcuts };
      const conflict = findShortcutConflict(merged);
      if (conflict) {
        throw new Error(`Shortcut "${conflict}" is already assigned to another action`);
      }
      clean.shortcuts = merged;
    }
    this.store.set((d) => {
      Object.assign(d, clean);
    });
    this.ensureRoot();
    this.applySystemSideEffects();
    return this.get();
  }

  /** Login-item side effect only meaningful for the packaged Windows app. */
  private applySystemSideEffects(): void {
    try {
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: this.get().startWithWindows });
      }
    } catch (e) {
      console.error('[settings] login item update failed', e);
    }
  }

  ensureRoot(): void {
    try {
      fs.mkdirSync(this.get().downloadRoot, { recursive: true });
    } catch (e) {
      console.error('[settings] cannot create download root', e);
    }
  }

  flush(): void {
    this.store.flush();
  }
}
