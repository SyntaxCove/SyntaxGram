import { useEffect, useState } from 'react';
import { AtSign, FolderOpen, History, Image as ImageIcon, Search, Trash2, Video } from 'lucide-react';
import type { HistoryEntry } from '../../../shared/types';
import { useUiStore } from '../stores/ui';
import { api, formatBytes, timeAgo } from '../lib/api';
import { EmptyState, GhostButton, PrimaryButton } from '../components/ui';

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');

  const refresh = async () => setEntries(await api.history.list());
  useEffect(() => {
    void refresh();
  }, []);

  const filtered = entries.filter((e) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return e.username.includes(q) || e.filename.toLowerCase().includes(q);
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-t1">History</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5">
              <Search size={13} className="text-t3" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search username or file"
                className="w-44 bg-transparent text-[12.5px] text-t1 placeholder:text-t4 focus:outline-none"
              />
            </div>
            {entries.length > 0 && (
              <GhostButton
                onClick={async () => {
                  await api.history.clear();
                  await refresh();
                }}
              >
                <Trash2 size={14} /> Clear
              </GhostButton>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {filtered.length === 0 ? (
            <EmptyState icon={<History size={22} />} title="History is empty" subtitle="Completed downloads are recorded here." />
          ) : (
            filtered.map((entry) => {
              const Icon = entry.mediaType === 'video' ? Video : ImageIcon;
              return (
                <div key={`${entry.id}-${entry.completedAt}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-sm">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-t2">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-t1">{entry.filename}</div>
                    <div className="text-[11px] text-t3">
                      @{entry.username} · {formatBytes(entry.bytes)} · {timeAgo(entry.completedAt)}
                    </div>
                  </div>
                  <GhostButton
                    onClick={() => {
                      void api.files.openFolder(entry.path);
                    }}
                  >
                    <FolderOpen size={14} />
                  </GhostButton>
                </div>
              );
            })
          )}
        </div>

        {filtered.length === 0 && entries.length === 0 && (
          <div className="mt-6 flex justify-center">
            <PrimaryButton onClick={() => useUiStore.getState().setPage('instagram')}>
              <AtSign size={15} /> Open Instagram
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
