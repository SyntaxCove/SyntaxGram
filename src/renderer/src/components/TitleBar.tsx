import { Camera, Copy, Minus, X } from 'lucide-react';
import { useUiStore } from '../stores/ui';
import { api } from '../lib/api';

export function TitleBar() {
  const maximized = useUiStore((s) => s.maximized);
  const page = useUiStore((s) => s.page);

  return (
    <header className="drag-region flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface pl-4">
      <div className="flex items-center gap-2.5">
        <div className="igd-gradient flex h-7 w-7 items-center justify-center rounded-lg">
          <Camera size={16} className="text-white" />
        </div>
        <span className="text-[13px] font-semibold text-t1">
          Instagram <span className="igd-gradient-text">Desktop</span>
        </span>
        <span className="ml-2 hidden text-[11px] uppercase tracking-wider text-t4 sm:inline">{page}</span>
      </div>
      <div className="no-drag flex h-full items-stretch">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => api.window.minimize()}
          className="flex w-12 items-center justify-center text-t2 transition-colors hover:bg-app hover:text-t1"
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => api.window.toggleMaximize()}
          className="flex w-12 items-center justify-center text-t2 transition-colors hover:bg-app hover:text-t1"
        >
          {maximized ? <Copy size={13} /> : <span className="block h-[11px] w-[11px] rounded-[2px] border-[1.5px] border-current" />}
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => api.window.close()}
          className="flex w-12 items-center justify-center text-t2 transition-colors hover:bg-red-600 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
