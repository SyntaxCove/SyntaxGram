// Failed downloads page: reason and attempt count per job, with retry
// (a retry re-resolves a fresh URL from the open page) and delete actions.

import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useDownloadsStore } from '../stores/downloads';
import { api } from '../lib/api';
import { JobCard } from '../components/JobCard';
import { EmptyState, GhostButton } from '../components/ui';

export function FailedPage() {
  const jobs = useDownloadsStore((s) => s.jobs);
  const failed = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-t1">Failed downloads</h1>
          <div className="flex gap-2">
            {failed.length > 0 && (
              <>
                <GhostButton onClick={() => api.download.retryAllFailed()}>
                  <RotateCcw size={14} /> Retry all
                </GhostButton>
                <GhostButton onClick={() => api.download.clearFailed()}>
                  <Trash2 size={14} /> Clear all
                </GhostButton>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {failed.length === 0 ? (
            <EmptyState
              icon={<AlertCircle size={22} />}
              title="No failed downloads"
              subtitle="If a download fails (e.g. an expired CDN link), it will appear here so you can retry or remove it."
            />
          ) : (
            failed.map((job) => <JobCard key={job.id} job={job} showReason />)
          )}
        </div>
      </div>
    </div>
  );
}
