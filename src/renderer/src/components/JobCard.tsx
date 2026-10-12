// Visual card for a single download job: type icon, filename, status chip,
// @username, progress (bytes / percent / speed) and state-dependent actions
// (pause, resume, retry, cancel, delete, open file / open folder).
// Shared by the Downloads, Queue and Failed pages (showReason adds the
// failure-reason line).

import {
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type { DownloadJob } from '../../../shared/types';
import { formatBytes, formatSpeed } from '../lib/api';
import { api } from '../lib/api';
import { IconButton, StatusChip } from './ui';

export function JobCard({ job, showReason = false }: { job: DownloadJob; showReason?: boolean }) {
  const total = job.totalBytes;
  const percent = total > 0 ? Math.min(100, Math.round((job.bytesReceived / total) * 100)) : null;
  const TypeIcon = job.mediaType === 'video' ? Video : ImageIcon;
  const filename = job.destinationPath.split(/[\\/]/).pop() ?? job.destinationPath;

  return (
    <div className="rounded-xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-t2">
          <TypeIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-t1">{filename}</span>
            <StatusChip status={job.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-t3">
            <span>@{job.username}</span>
            <span>
              {formatBytes(job.bytesReceived)}
              {total > 0 ? ` / ${formatBytes(total)}` : ''}
            </span>
            {job.status === 'downloading' && <span className="text-sky-600 dark:text-sky-400">{formatSpeed(job.speedBps ?? 0)}</span>}
            <span>
              attempt {job.attemptCount}/{job.maxAttempts}
            </span>
          </div>
          {showReason && job.error && (
            <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">
              {job.error}
              {job.errorCode ? ` · ${job.errorCode}` : ''}
            </div>
          )}
          <div
            className={`igd-progress-track mt-2 h-1.5 w-full ${percent === null && job.status === 'downloading' ? 'igd-progress-indeterminate' : ''}`}
          >
            {percent !== null && (
              <div
                className={`igd-progress-bar ${job.status === 'failed' ? '!bg-red-500' : job.status === 'completed' ? '!bg-emerald-500' : ''}`}
                style={{ width: `${job.status === 'completed' ? 100 : percent}%` }}
              />
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {(job.status === 'downloading' || job.status === 'queued') && (
            <IconButton title="Pause" onClick={() => api.download.pause(job.id)}>
              <Pause size={14} />
            </IconButton>
          )}
          {job.status === 'paused' && (
            <IconButton title="Resume" onClick={() => api.download.resume(job.id)}>
              <Play size={14} />
            </IconButton>
          )}
          {(job.status === 'downloading' || job.status === 'queued' || job.status === 'paused') && (
            <IconButton title="Cancel" danger onClick={() => api.download.cancel(job.id)}>
              <X size={14} />
            </IconButton>
          )}
          {(job.status === 'failed' || job.status === 'cancelled') && (
            <IconButton title="Retry" onClick={() => api.download.retry(job.id)}>
              <RotateCcw size={14} />
            </IconButton>
          )}
          {job.status === 'completed' && (
            <>
              <IconButton title="Open file" onClick={() => api.download.openFile(job.id)}>
                <ExternalLink size={14} />
              </IconButton>
              <IconButton title="Open folder" onClick={() => api.download.openFolder(job.id)}>
                <FolderOpen size={14} />
              </IconButton>
            </>
          )}
          <IconButton title="Delete" danger onClick={() => api.download.remove(job.id)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
