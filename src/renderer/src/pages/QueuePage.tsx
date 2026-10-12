import { ChevronDown, ChevronUp, ListOrdered, PauseCircle, PlayCircle } from 'lucide-react';
import { useDownloadsStore } from '../stores/downloads';
import { useSettingsStore } from '../stores/settings';
import { api } from '../lib/api';
import { JobCard } from '../components/JobCard';
import { EmptyState, GhostButton } from '../components/ui';

export function QueuePage() {
  const jobs = useDownloadsStore((s) => s.jobs);
  const settings = useSettingsStore((s) => s.settings);
  const downloading = jobs.filter((j) => j.status === 'downloading');
  const queued = jobs.filter((j) => j.status === 'queued');

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-t1">Queue</h1>
            <p className="mt-1 text-[12.5px] text-t3">
              FIFO order · max {settings?.maxConcurrentDownloads ?? 3} concurrent · {downloading.length} running
            </p>
          </div>
          <div className="flex gap-2">
            <GhostButton onClick={() => api.download.pauseAll()}>
              <PauseCircle size={14} /> Pause all
            </GhostButton>
            <GhostButton onClick={() => api.download.resumeAll()}>
              <PlayCircle size={14} /> Resume all
            </GhostButton>
          </div>
        </div>

        <h2 className="mt-5 text-[12px] font-semibold uppercase tracking-wider text-t3">Running</h2>
        <div className="mt-2 space-y-2.5">
          {downloading.length === 0 ? (
            <EmptyState icon={<ListOrdered size={22} />} title="Nothing is downloading right now" />
          ) : (
            downloading.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </div>

        <h2 className="mt-6 text-[12px] font-semibold uppercase tracking-wider text-t3">Waiting</h2>
        <div className="mt-2 space-y-2.5">
          {queued.length === 0 ? (
            <EmptyState icon={<ListOrdered size={22} />} title="Queue is empty" subtitle="New downloads will line up here in FIFO order." />
          ) : (
            queued.map((job, index) => (
              <div key={job.id} className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1 pt-4">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => api.download.reorder(job.id, 'up')}
                    className="text-t3 transition-colors hover:text-t1 disabled:opacity-25"
                  >
                    <ChevronUp size={15} />
                  </button>
                  <span className="text-[11px] font-medium text-t4">{index + 1}</span>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === queued.length - 1}
                    onClick={() => api.download.reorder(job.id, 'down')}
                    className="text-t3 transition-colors hover:text-t1 disabled:opacity-25"
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <JobCard job={job} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
