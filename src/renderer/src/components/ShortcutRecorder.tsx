import { useEffect, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { comboFromEvent, shortcutChips } from '../../../shared/shortcuts';

/**
 * Click-to-rebind shortcut control (user request: remappable shortcuts).
 * While recording, the first complete key combo is captured; Escape cancels.
 * Modifier-only presses keep the recorder waiting for the full combo.
 */
export function ShortcutRecorder({
  value,
  recording,
  onStart,
  onCancel,
  onCapture,
}: {
  value: string;
  recording: boolean;
  onStart: () => void;
  onCancel: () => void;
  onCapture: (combo: string) => void;
}) {
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.isComposing) return;
      const captured = comboFromEvent(e);
      if (!captured) {
        // Modifier-only or unmapped key: flash feedback, keep listening.
        setInvalid(true);
        setTimeout(() => setInvalid(false), 350);
        return;
      }
      onCapture(captured);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, onCancel, onCapture]);

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <kbd
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
            invalid ? 'border-red-400 text-red-600 dark:text-red-400' : 'border-brand-2 bg-surface text-t1'
          }`}
        >
          <Keyboard size={13} className="text-brand-2" />
          Press keys…
        </kbd>
        <span className="text-[11px] text-t3">Esc to cancel</span>
        <button
          type="button"
          aria-label="Cancel recording"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-t3 transition-colors hover:bg-app hover:text-t1"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {shortcutChips(value).map((chip) => (
          <kbd
            key={chip}
            className="min-w-[26px] rounded-md border border-line bg-surface-2 px-1.5 py-1 text-center text-[11.5px] font-semibold text-t1"
          >
            {chip}
          </kbd>
        ))}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] font-medium text-t2 transition-colors hover:bg-app hover:text-t1"
      >
        Change
      </button>
    </div>
  );
}
