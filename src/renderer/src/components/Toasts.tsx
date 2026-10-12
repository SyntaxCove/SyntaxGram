import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useToastStore } from '../stores/toasts';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const COLORS = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-sky-600 dark:text-sky-400',
} as const;

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-xl backdrop-blur"
          >
            <Icon size={16} className={`mt-0.5 shrink-0 ${COLORS[toast.kind]}`} />
            <span className="flex-1 text-[12.5px] leading-snug text-t1">{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => remove(toast.id)}
              className="text-t3 transition-colors hover:text-t1"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
