import { AtSign, Camera, Download, FolderOpen, HardDrive, History, ListOrdered, Play, Zap } from 'lucide-react';
import { useDownloadsStore } from '../stores/downloads';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';
import { api, formatBytes, formatSpeed } from '../lib/api';
import { EmptyState, GhostButton, PrimaryButton, SectionCard, StatCard } from '../components/ui';
import { DEFAULT_SHORTCUTS, displayShortcut } from '../../../shared/shortcuts';

export function DashboardPage() {
  const stats = useDownloadsStore((s) => s.stats);
  const jobs = useDownloadsStore((s) => s.jobs);
  const settings = useSettingsStore((s) => s.settings);
  const setPage = useUiStore((s) => s.setPage);
  const sc = settings?.shortcuts ?? DEFAULT_SHORTCUTS;
  const recent = jobs.filter((j) => j.status === 'completed').slice(0, 6);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-bold text-t1">Dashboard</h1>
        <p className="mt-1 text-[13px] text-t3">
          Your Instagram session, enhanced with a private download manager. Everything runs locally on your machine.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="Active" value={stats?.active ?? 0} hint="Active downloads" icon={<Play size={15} />} />
          <StatCard label="Queued" value={stats?.queued ?? 0} hint="Waiting in queue" icon={<ListOrdered size={15} />} />
          <StatCard label="Completed" value={stats?.completed ?? 0} hint="Completed (recent)" icon={<Download size={15} />} />
          <StatCard label="Failed" value={stats?.failed ?? 0} hint="Failed downloads" icon={<Camera size={15} />} />
          <StatCard
            label="Speed"
            value={formatSpeed(stats?.totalSpeedBps ?? 0) || '—'}
            hint="Current speed"
            icon={<Zap size={15} />}
          />
          <StatCard
            label="Downloaded"
            value={formatBytes(stats?.sessionBytes ?? 0)}
            hint={`Session · all time ${formatBytes(stats?.allTimeBytes ?? 0)}`}
            icon={<HardDrive size={15} />}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <PrimaryButton onClick={() => setPage('instagram')}>
            <AtSign size={15} /> Open Instagram
          </PrimaryButton>
          <GhostButton onClick={() => api.files.openFolder(settings?.downloadRoot)}>
            <FolderOpen size={15} /> Open download folder
          </GhostButton>
          <GhostButton onClick={() => setPage('downloads')}>
            <Download size={15} /> View downloads
          </GhostButton>
        </div>

        <SectionCard className="mt-5">
          <h2 className="text-[13px] font-semibold text-t1">Quick start</h2>
          <ol className="mt-2.5 space-y-1.5 text-[12.5px] text-t2">
            <li>1. Open the Instagram page from the sidebar and browse like a normal browser.</li>
            <li>2. Hover any post or story — a small download button appears next to the like button.</li>
            <li>
              3. Or use keyboard shortcuts:{' '}
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-t2">{displayShortcut(sc.like)}</kbd> like ·{' '}
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-t2">{displayShortcut(sc.downloadAll)}</kbd> download all ·{' '}
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-t2">{displayShortcut(sc.downloadCurrent)}</kbd> download current
              slide.
            </li>
            <li>4. Files are saved per username into images/ and videos/ folders under your download root.</li>
          </ol>
        </SectionCard>

        <SectionCard className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-t1">Recent downloads</h2>
            <button type="button" onClick={() => setPage('history')} className="text-[12px] font-medium text-brand-2 hover:underline">
              View history
            </button>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon={<History size={22} />} title="No downloads yet" subtitle="Downloads will appear here once you save your first media." />
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="truncate text-[12.5px] text-t2">
                    <span className="font-medium text-t1">@{job.username}</span> · {job.destinationPath.split(/[\\/]/).pop()}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-[11px] text-t3">
                    {formatBytes(job.bytesReceived)}
                    <button type="button" onClick={() => api.download.openFolder(job.id)} className="hover:text-t1">
                      <FolderOpen size={13} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {settings && (
          <p className="mt-4 text-center text-[11px] text-t4">
            Saving to <span className="text-t3">{settings.downloadRoot}</span> · change it in Settings
          </p>
        )}
      </div>
    </div>
  );
}
