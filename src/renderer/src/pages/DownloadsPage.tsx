// Downloads page: all jobs filtered by status tabs (active / queued /
// completed / failed) with bulk pause / resume / clear controls.
// Rows are rendered by JobCard.

import { useState } from 'react';
import { Download, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import type { DownloadJob } from '../../../shared/types';
import { useDownloadsStore } from '../stores/downloads';
import { api } from '../lib/api';
import { JobCard } from '../components/JobCard';
import { EmptyState, GhostButton } from '../components/ui';

type Tab = 'active' | 'queued' | 'completed' | 'failed';

const TAB_FILTER: Record<Tab, (j: DownloadJob) => boolean> = {
  active: (j) => j.status === 'downloading',
  queued: (j) => j.status === 'queued' || j.status === 'paused',
  completed: (j) => j.status === 'completed',
  failed: (j) => j.status === 'failed' || j.status === 'cancelled',
};

export function DownloadsPage() {
  const [tab, setTab] = useState<Tab>('active');
  const jobs = useDownloadsStore((s) => s.jobs);
  const stats = useDownloadsStore((s) => s.stats);

  const filtered = jobs.filter(TAB_FILTER[tab]);
  const counts: Record<Tab, number> = {
    active: stats?.active ?? 0,
    queued: (stats?.queued ?? 0) + (stats?.paused ?? 0),
    completed: stats?.completed ?? 0,
    failed: (stats?.failed ?? 0) + (stats?.cancelled ?? 0),
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'queued', label: 'Queued' },
    { id: 'completed', label: 'Completed' },
    { id: 'failed', label: 'Failed' },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-t1">Downloads</h1>
          <div className="flex gap-2">
            {tab === 'active' || tab === 'queued' ? (
              <>
                <GhostButton onClick={() => api.download.pauseAll()}>
                  <PauseCircle size={14} /> Pause all
                </GhostButton>
                <GhostButton onClick={() => api.download.resumeAll()}>
                  <PlayCircle size={14} /> Resume all
                </GhostButton>
              </>
            ) : null}
            {tab === 'completed' && counts.completed > 0 ? (
              <GhostButton onClick={() => api.download.clearCompleted()}>
                <Trash2 size={14} /> Clear completed
              </GhostButton>
            ) : null}
            {tab === 'failed' && counts.failed > 0 ? (
              <GhostButton onClick={() => api.download.clearFailed()}>
                <Trash2 size={14} /> Clear failed
              </GhostButton>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex gap-1.5 rounded-xl border border-line bg-app p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                tab === t.id ? 'bg-surface text-t1 shadow-sm' : 'text-t2 hover:text-t1'
              }`}
            >
              {t.label}
              <span className="rounded-full bg-surface-2 px-1.5 text-[10px] text-t3">{counts[t.id]}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Download size={22} />}
              title={`No ${tab} downloads`}
              subtitle="Hover any post or story on the Instagram page and click the download button, or press D."
            />
          ) : (
            filtered.map((job) => <JobCard key={job.id} job={job} showReason={tab === 'failed'} />)
          )}
        </div>
      </div>
    </div>
  );
}
