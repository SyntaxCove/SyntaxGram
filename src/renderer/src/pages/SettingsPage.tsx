// Settings page: appearance (theme), download behavior (folder picker,
// concurrency, retry attempts, duplicate handling), app integration
// (notifications, start with Windows, minimize to tray), custom
// User-Agent and remappable keyboard shortcuts (ShortcutRecorder).
// Every change persists immediately via the settings store; the main
// process validates it and applies it live.

import { useState, useEffect } from 'react';
import { Check, Contrast, FolderOpen, Keyboard, Loader2, RotateCcw } from 'lucide-react';
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, displayShortcut } from '../../../shared/shortcuts';
import type { AppSettings, ShortcutConfig } from '../../../shared/types';
import { useSettingsStore } from '../stores/settings';
import { useToastStore } from '../stores/toasts';
import { api } from '../lib/api';
import { GhostButton, Select, SectionCard, TextInput, Toggle } from '../components/ui';
import { ShortcutRecorder } from '../components/ShortcutRecorder';

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-t1">{title}</div>
        {description ? <div className="mt-0.5 text-[11.5px] leading-snug text-t3">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const ACTION_LABELS: Record<keyof ShortcutConfig, string> = Object.fromEntries(
  SHORTCUT_ACTIONS.map((a) => [a.id, a.label]),
) as Record<keyof ShortcutConfig, string>;

export function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const apply = useSettingsStore((s) => s.apply);
  const toast = useToastStore((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<keyof ShortcutConfig | null>(null);
  const [uaDraft, setUaDraft] = useState('');
  const settingsUa = settings?.userAgent ?? '';

  // Keep the draft in sync when the setting changes from elsewhere.
  useEffect(() => {
    setUaDraft(settingsUa);
  }, [settingsUa]);

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-t3">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  const shortcuts: ShortcutConfig = settings.shortcuts ?? DEFAULT_SHORTCUTS;

  const save = async (patch: Partial<AppSettings>, message = 'Settings saved') => {
    try {
      await apply(patch);
      toast('success', message);
    } catch {
      toast('error', 'Could not save settings');
    }
  };

  const browse = async () => {
    setBusy(true);
    try {
      const dir = await api.settings.chooseDownloadRoot();
      if (dir) await save({ downloadRoot: dir }, `Download folder set to ${dir}`);
    } finally {
      setBusy(false);
    }
  };

  /** Apply a newly captured combo after checking conflicts locally (the main
   * process re-validates and persists; injector picks it up live). */
  const applyShortcut = async (action: keyof ShortcutConfig, combo: string) => {
    setRecording(null);
    if (combo === shortcuts[action]) return;
    const clash = SHORTCUT_ACTIONS.find((a) => a.id !== action && shortcuts[a.id] === combo);
    if (clash) {
      toast('error', `"${displayShortcut(combo)}" is already used by ${ACTION_LABELS[clash.id]}`);
      return;
    }
    await save({ shortcuts: { ...shortcuts, [action]: combo } }, `${ACTION_LABELS[action]} shortcut set to ${displayShortcut(combo)}`);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold text-t1">Settings</h1>
        <p className="mt-1 text-[13px] text-t3">All changes are applied instantly and persisted locally.</p>

        <SectionCard className="mt-5">
          <h2 className="mb-1 text-[13px] font-semibold text-t1">Appearance</h2>
          <Row title="Theme" description="Light is the default look. Dark mode is available for low-light environments.">
            <Select
              label="Theme"
              value={settings.theme ?? 'light'}
              onChange={(v) => void save({ theme: v as AppSettings['theme'] }, v === 'dark' ? 'Dark theme enabled' : 'Light theme enabled')}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
        </SectionCard>

        <SectionCard className="mt-4">
          <h2 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-t1">
            <Contrast size={14} /> Downloads
          </h2>
          <Row title="Download folder" description={settings.downloadRoot}>
            <div className="flex gap-2">
              <GhostButton onClick={browse} disabled={busy}>
                <FolderOpen size={14} /> Browse…
              </GhostButton>
              <GhostButton onClick={() => api.files.openFolder(settings.downloadRoot)}>Open</GhostButton>
            </div>
          </Row>
          <Row title="Maximum concurrent downloads" description="How many files download at the same time.">
            <Select
              label="Maximum concurrent downloads"
              value={String(settings.maxConcurrentDownloads)}
              onChange={(v) => save({ maxConcurrentDownloads: Number(v) })}
              options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: String(n), label: `${n} at a time` }))}
            />
          </Row>
          <Row title="Maximum download attempts" description="Retries only happen for recoverable errors (timeouts, 5xx, 429…).">
            <Select
              label="Maximum download attempts"
              value={String(settings.maxRetryAttempts)}
              onChange={(v) => save({ maxRetryAttempts: Number(v) })}
              options={[1, 2, 3, 5, 10].map((n) => ({ value: String(n), label: `${n} attempt${n > 1 ? 's' : ''}` }))}
            />
          </Row>
          <Row title="Duplicate files" description="What to do when the same media was downloaded before.">
            <Select
              label="Duplicate file behavior"
              value={settings.duplicateBehavior}
              onChange={(v) => save({ duplicateBehavior: v as AppSettings['duplicateBehavior'] })}
              options={[
                { value: 'unique', label: 'Create unique filename' },
                { value: 'overwrite', label: 'Overwrite' },
                { value: 'skip', label: 'Skip' },
              ]}
            />
          </Row>
        </SectionCard>

        <SectionCard className="mt-4">
          <h2 className="mb-1 text-[13px] font-semibold text-t1">Application</h2>
          <Row title="Notifications" description="Native Windows notifications when a download completes or fails.">
            <Toggle label="Notifications" checked={settings.notifications} onChange={(v) => save({ notifications: v })} />
          </Row>
          <Row title="Start with Windows" description="Launch automatically when you sign in (applies to the installed app).">
            <Toggle label="Start with Windows" checked={settings.startWithWindows} onChange={(v) => save({ startWithWindows: v })} />
          </Row>
          <Row title="Minimize to tray" description="Closing the window keeps the app running in the system tray.">
            <Toggle label="Minimize to tray" checked={settings.minimizeToTray} onChange={(v) => save({ minimizeToTray: v })} />
          </Row>
          <Row
            title="User agent"
            description="Empty = built-in default (recommended). A custom value is applied after an automatic page reload."
          >
            <div className="flex items-center gap-2">
              <TextInput
                label="User agent"
                value={uaDraft}
                onChange={setUaDraft}
                placeholder="Default (recommended)"
                width={300}
              />
              {uaDraft !== settingsUa ? (
                <GhostButton
                  onClick={() =>
                    void save({ userAgent: uaDraft }, uaDraft.trim() ? 'User agent updated' : 'User agent reset to default')
                  }
                >
                  <Check size={14} /> Apply
                </GhostButton>
              ) : null}
              {settingsUa ? (
                <GhostButton
                  onClick={() => {
                    setUaDraft('');
                    void save({ userAgent: '' }, 'User agent reset to default');
                  }}
                >
                  <RotateCcw size={14} />
                </GhostButton>
              ) : null}
            </div>
          </Row>
        </SectionCard>

        <SectionCard className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold text-t1">
              <Keyboard size={14} /> Keyboard shortcuts
            </h2>
            <button
              type="button"
              className="flex items-center gap-1 text-[11.5px] text-t3 hover:text-t1"
              onClick={() => {
                setRecording(null);
                void save({ shortcuts: { ...DEFAULT_SHORTCUTS } }, 'Shortcuts reset to defaults');
              }}
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
          <div className="mt-2">
            {SHORTCUT_ACTIONS.map((action) => (
              <Row key={action.id} title={action.label} description={action.description}>
                <ShortcutRecorder
                  value={shortcuts[action.id]}
                  recording={recording === action.id}
                  onStart={() => setRecording(action.id)}
                  onCancel={() => setRecording(null)}
                  onCapture={(combo) => void applyShortcut(action.id, combo)}
                />
              </Row>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-t4">
            Shortcuts only work while the mouse is over a post or story, and never while typing in any field.
            New bindings apply immediately — the Instagram page does not need to be reloaded.
          </p>
        </SectionCard>

        <p className="mt-4 pb-4 text-center text-[11px] text-t4">
          Settings and queue data are stored locally on this device · session cookies never leave the app
        </p>
      </div>
    </div>
  );
}
