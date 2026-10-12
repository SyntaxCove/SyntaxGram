// Zustand store for download jobs + queue stats. Seeded once via load()
// (IPC snapshot) and kept live by main-process push events routed in
// App.tsx (api.events.onJobs / onStats).

import { create } from 'zustand';
import type { DownloadJob, QueueStats } from '../../../shared/types';
import { api } from '../lib/api';

interface DownloadsState {
  jobs: DownloadJob[];
  stats: QueueStats | null;
  setJobs: (jobs: DownloadJob[]) => void;
  setStats: (stats: QueueStats) => void;
  load: () => Promise<void>;
}

export const useDownloadsStore = create<DownloadsState>((set) => ({
  jobs: [],
  stats: null,
  setJobs: (jobs) => set({ jobs }),
  setStats: (stats) => set({ stats }),
  load: async () => {
    const snap = await api.download.list();
    set({ jobs: snap.jobs, stats: snap.stats });
  },
}));
