// Shared UI primitives for all pages: SectionCard, StatCard, EmptyState,
// IconButton, PrimaryButton / GhostButton, Toggle, Select, TextInput,
// StatusChip and CloseButton. Built on the Tailwind theme tokens
// (t1-t4 text, line, surface, brand-2) so pages stay visually consistent.

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-5 shadow-sm ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 shadow-sm">
      {icon ? <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-t2">{icon}</div> : null}
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-t1">{value}</div>
        <div className="text-[11px] text-t3">{hint ?? label}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-t3">{icon}</div>
      <div className="text-sm font-medium text-t1">{title}</div>
      {subtitle ? <div className="max-w-sm text-xs text-t3">{subtitle}</div> : null}
    </div>
  );
}

export function IconButton({
  onClick,
  title,
  children,
  danger = false,
  disabled = false,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface transition-colors hover:bg-app disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300' : 'text-t2 hover:text-t1'
      }`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="igd-gradient no-drag flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  disabled = false,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-t1 transition-colors hover:bg-app disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-line-strong'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-t1 outline-none focus:border-brand-2"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
  width = 260,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  width?: number;
}) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      style={{ width }}
      className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-t1 outline-none placeholder:text-t4 focus:border-brand-2"
    />
  );
}

export function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    downloading: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    queued: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    paused: 'bg-zinc-500/15 text-t2',
    completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
    cancelled: 'bg-zinc-500/15 text-t3',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[status] ?? styles.paused}`}>
      {status}
    </span>
  );
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss"
      onClick={onClose}
      className="text-t3 transition-colors hover:text-t1"
    >
      <X size={14} />
    </button>
  );
}
